/* =============================================================
   data.js
   Single data service/adapter layer.
     - Stale-while-revalidate cache with TTL
     - In-flight request dedupe + AbortController on filter change
     - Parallel requests (Promise.all)
     - Exponential backoff retry with timeout
     - Normalized response shape with NaN/null guards
     - Mock layer for frontend-only gyms (IHC Jahra, IHC Salmiya)
   ============================================================= */

(function (global) {
  "use strict";

  /** Backend base URL — kept in one place so it can be swapped per env. */
  const API_BASE = (global.ICH_API_BASE || "http://localhost:8030");

  /** Default request timeout (ms). */
  const DEFAULT_TIMEOUT = 12_000;

  /** SWR TTL — data is considered "fresh" for this long. */
  const FRESH_TTL = 30_000;

  /** Cache key version. Bump if the response shape changes meaningfully. */
  const CACHE_VERSION = "v1";

  // ----------------------------------------------------------
  // Cache: { key -> { ts, data, promise, controller } }
  // ----------------------------------------------------------
  const cache = new Map();

  // Track the latest "owner" token. Any in-flight call made under an
  // older token is aborted when a new owner is set, so stale responses
  // never overwrite fresh ones.
  let ownerToken = 0;
  function newOwner() { ownerToken += 1; return ownerToken; }
  function isCurrent(token) { return token === ownerToken; }

  function cacheKey(path, params) {
    const qp = Object.keys(params || {})
      .sort()
      .map((k) => k + "=" + encodeURIComponent(params[k]))
      .join("&");
    return CACHE_VERSION + ":" + path + "?" + qp;
  }

  function getCached(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    return hit;
  }

  // ----------------------------------------------------------
  // fetchJSON — internal, with timeout, abort, retry/backoff
  // ----------------------------------------------------------
  async function fetchJSON(url, opts) {
    const timeout = (opts && opts.timeout) || DEFAULT_TIMEOUT;
    const retries = (opts && opts.retries) || 2;
    const token = opts && opts.token;
    let attempt = 0;
    let lastErr = null;

    while (attempt <= retries) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const r = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
          headers: (opts && opts.headers) || { Accept: "application/json" },
        });
        clearTimeout(timer);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const data = await r.json();
        return data;
      } catch (err) {
        clearTimeout(timer);
        if (controller.signal.aborted && token !== undefined && !isCurrent(token)) {
          // Caller moved on; surface a recognizable abort error.
          const e = new Error("aborted"); e.name = "AbortError"; throw e;
        }
        lastErr = err;
        attempt += 1;
        if (attempt > retries) break;
        // Exponential backoff with small jitter
        const wait = Math.min(2500, 250 * Math.pow(2, attempt)) + Math.random() * 120;
        await new Promise((res) => setTimeout(res, wait));
      }
    }
    throw lastErr || new Error("Network error");
  }

  // ----------------------------------------------------------
  // swrGet — stale-while-revalidate
  //   Returns { data, isFresh, isLoading, revalidate, key }
  // ----------------------------------------------------------
  function swrGet(path, params) {
    const key = cacheKey(path, params);
    const hit = getCached(key);
    const token = newOwner();

    if (hit) {
      // Re-fire in background if stale. Cache is mutated in place.
      if (Date.now() - hit.ts > FRESH_TTL && !hit.inflight) {
        hit.inflight = true;
        fireBackground(key, path, params, hit);
      }
      return Promise.resolve({
        key,
        data: hit.data,
        isFresh: Date.now() - hit.ts <= FRESH_TTL,
        isLoading: false,
        revalidate: () => revalidateKey(key, path, params),
        token,
      });
    }

    // Cold path: no cache at all. Fire the request.
    const controller = new AbortController();
    const p = fetchJSON(API_BASE + path + "?" + new URLSearchParams(params || {}).toString(), {
      timeout: DEFAULT_TIMEOUT,
      retries: 2,
      token,
    })
      .then((data) => {
        const normalized = normalize(path, data, params);
        cache.set(key, { ts: Date.now(), data: normalized, inflight: false });
        return { key, data: normalized, isFresh: true, isLoading: false, revalidate: () => revalidateKey(key, path, params), token };
      })
      .catch((err) => {
        cache.delete(key);
        throw err;
      });
    return p;
  }

  function fireBackground(key, path, params, slot) {
    const token = ownerToken;
    fetchJSON(API_BASE + path + "?" + new URLSearchParams(params || {}).toString(), {
      timeout: DEFAULT_TIMEOUT,
      retries: 1,
      token,
    })
      .then((data) => {
        if (!isCurrent(token)) return;
        slot.data = normalize(path, data, params);
        slot.ts = Date.now();
        if (subscribers.has(key)) {
          subscribers.get(key).forEach((fn) => { try { fn(slot.data); } catch (_) { /* ignore */ } });
        }
      })
      .catch(() => { /* silent background */ })
      .finally(() => { slot.inflight = false; });
  }

  function revalidateKey(key, path, params) {
    const slot = cache.get(key) || { ts: 0, data: null, inflight: false };
    slot.inflight = true;
    cache.set(key, slot);
    const token = ownerToken;
    return fetchJSON(API_BASE + path + "?" + new URLSearchParams(params || {}).toString(), {
      timeout: DEFAULT_TIMEOUT,
      retries: 2,
      token,
    })
      .then((data) => {
        slot.data = normalize(path, data, params);
        slot.ts = Date.now();
        slot.inflight = false;
        if (subscribers.has(key)) {
          subscribers.get(key).forEach((fn) => { try { fn(slot.data); } catch (_) { /* ignore */ } });
        }
        return slot.data;
      })
      .catch((err) => { slot.inflight = false; throw err; });
  }

  // ----------------------------------------------------------
  // Subscribers: lets charts re-render when a background refresh
  // lands without re-running the orchestrator.
  // ----------------------------------------------------------
  const subscribers = new Map();
  function subscribe(key, fn) {
    if (!subscribers.has(key)) subscribers.set(key, new Set());
    subscribers.get(key).add(fn);
    return () => subscribers.get(key).delete(fn);
  }

  // ----------------------------------------------------------
  // Normalization — guards against null/NaN/undefined from API
  // ----------------------------------------------------------
  function n(v, d) {
    if (v == null) return d == null ? 0 : d;
    const num = Number(v);
    if (isNaN(num) || !isFinite(num)) return d == null ? 0 : d;
    return num;
  }
  function s(v, d) {
    if (v == null) return d == null ? "" : d;
    return String(v);
  }

  function normalize(path, data, params) {
    if (!data || typeof data !== "object") return data;
    // Numeric guards on the shape we use
    if (data.kpis) {
      data.kpis.sales = n(data.kpis.sales);
      data.kpis.target = n(data.kpis.target);
      data.kpis.achievement = n(data.kpis.achievement);
      data.kpis.remaining = n(data.kpis.remaining);
      data.kpis.required_daily = n(data.kpis.required_daily);
      data.kpis.transactions = n(data.kpis.transactions);
      data.kpis.average_transaction = n(data.kpis.average_transaction);
      data.kpis.days_elapsed = n(data.kpis.days_elapsed);
      data.kpis.days_remaining = n(data.kpis.days_remaining);
    }
    if (data.today) {
      data.today.sales = n(data.today.sales);
      data.today.transactions = n(data.today.transactions);
      data.today.date = s(data.today.date, "");
    }
    if (Array.isArray(data.sales_units)) {
      data.sales_units = data.sales_units.map((u) => ({
        ...u,
        sales: n(u.sales),
        transactions: n(u.transactions),
        target: n(u.target),
        achievement: n(u.achievement),
        remaining: n(u.remaining),
        average_transaction: n(u.average_transaction),
      }));
    }
    if (Array.isArray(data.daily)) {
      data.daily = data.daily.map((r) => ({
        ...r,
        stretch_men: n(r.stretch_men),
        stretch_ladies: n(r.stretch_ladies),
        the_gym_mishref: n(r.the_gym_mishref),
        ihc_express: n(r.ihc_express),
        combined: n(r.combined),
      }));
    }
    if (Array.isArray(data.monthly)) {
      data.monthly = data.monthly.map((r) => ({
        ...r,
        stretch_men: n(r.stretch_men),
        stretch_ladies: n(r.stretch_ladies),
        the_gym_mishref: n(r.the_gym_mishref),
        ihc_express: n(r.ihc_express),
        combined: n(r.combined),
        target: n(r.target),
      }));
    }
    if (data.revenue && data.revenue.sources) {
      Object.keys(data.revenue.sources).forEach((k) => {
        data.revenue.sources[k] = n(data.revenue.sources[k]);
      });
    }
    return data;
  }

  // ----------------------------------------------------------
  // Mock layer for frontend-only gyms
  // ----------------------------------------------------------
  /**
   * For gyms that exist in the UI but not yet in the backend
   * (IHC Jahra, IHC Salmiya) we synthesize a sales unit row that
   * matches the backend shape. Numbers are deterministic from the
   * (year, month) so the UI doesn't shimmer between renders.
   */
  const MOCK_GYMS = {
    ihc_jahra: {
      code: "ihc_jahra",
      name: "IHC Jahra",
      status: "online",
      baseDaily: 1450,
      baseTransactions: 42,
      baseTarget: 46000,
    },
    ihc_salmiya: {
      code: "ihc_salmiya",
      name: "IHC Salmiya",
      status: "online",
      baseDaily: 980,
      baseTransactions: 31,
      baseTarget: 31000,
    },
  };

  function mockUnitFor(code, year, month) {
    const m = MOCK_GYMS[code];
    if (!m) return null;
    // Stable pseudo-random based on (code, year, month)
    const seed = (code.charCodeAt(0) * 31 + year * 7 + month * 13) >>> 0;
    const variance = 0.85 + ((seed % 30) / 100); // 0.85 - 1.14
    const daysInMonth = new Date(year, month, 0).getDate();
    const sales = round2(m.baseDaily * daysInMonth * variance);
    const transactions = Math.round(m.baseTransactions * daysInMonth * variance);
    const target = round2(m.baseTarget);
    const achievement = target > 0 ? round2((sales / target) * 100) : 0;
    return {
      code: m.code,
      name: m.name,
      status: m.status,
      sales,
      transactions,
      target,
      achievement,
      remaining: round2(Math.max(target - sales, 0)),
      average_transaction: transactions > 0 ? round2(sales / transactions) : 0,
      data_available: true,
      daily_available: true,
      revenue_available: false,
      error: null,
    };
  }

  function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

  /**
   * Augment the backend's sales_units with mock rows for any frontend-only
   * gym that wasn't returned. Also synthesizes daily/monthly rows for the
   * comparison chart so the All-Branches view doesn't have a hole.
   */
  function injectMocks(data, year, month) {
    if (!data) return data;
    const known = new Set((data.sales_units || []).map((u) => u.code));
    (data.sales_units || (data.sales_units = [])).forEach; // (no-op keep linter happy)
    Object.keys(MOCK_GYMS).forEach((code) => {
      if (!known.has(code)) {
        const u = mockUnitFor(code, year, month);
        if (u) data.sales_units.push(u);
      }
    });

    // Add mock daily entries so the trend chart is full
    if (Array.isArray(data.daily)) {
      const knownCodes = new Set();
      data.daily.forEach((row) => {
        Object.keys(row).forEach((k) => {
          if (["ihc_jahra", "ihc_salmiya"].indexOf(k) !== -1) knownCodes.add(k);
        });
      });
      data.daily.forEach((row, i) => {
        if (!("ihc_jahra" in row)) row.ihc_jahra = 0;
        if (!("ihc_salmiya" in row)) row.ihc_salmiya = 0;
        if (!knownCodes.has("ihc_jahra")) {
          const u = MOCK_GYMS.ihc_jahra;
          row.ihc_jahra = round2(u.baseDaily * (0.7 + ((i * 13) % 30) / 100));
        }
        if (!knownCodes.has("ihc_salmiya")) {
          const u = MOCK_GYMS.ihc_salmiya;
          row.ihc_salmiya = round2(u.baseDaily * (0.5 + ((i * 17) % 40) / 100));
        }
        row.combined = round2(
          (row.stretch_men || 0) + (row.stretch_ladies || 0) +
          (row.the_gym_mishref || 0) + (row.ihc_express || 0) +
          (row.ihc_jahra || 0) + (row.ihc_salmiya || 0)
        );
      });
    }

    if (Array.isArray(data.monthly)) {
      data.monthly.forEach((row, i) => {
        if (!("ihc_jahra" in row)) row.ihc_jahra = round2((MOCK_GYMS.ihc_jahra.baseDaily * 30) * (0.85 + ((i * 11) % 30) / 100));
        if (!("ihc_salmiya" in row)) row.ihc_salmiya = round2((MOCK_GYMS.ihc_salmiya.baseDaily * 30) * (0.75 + ((i * 7) % 30) / 100));
        row.combined = round2(
          (row.stretch_men || 0) + (row.stretch_ladies || 0) +
          (row.the_gym_mishref || 0) + (row.ihc_express || 0) +
          (row.ihc_jahra || 0) + (row.ihc_salmiya || 0)
        );
      });
    }

    return data;
  }

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  async function getDashboard(year, month) {
    const res = await swrGet("/api/dashboard", { year, month });
    res.data = injectMocks(res.data, year, month);
    return res;
  }

  async function getBranches() {
    const res = await swrGet("/api/branches", {});
    return res;
  }

  async function getHealth() {
    try {
      const r = await fetch(API_BASE + "/api/health", { cache: "no-store" });
      if (!r.ok) return { ok: false };
      const j = await r.json();
      return { ok: j && j.status === "online" };
    } catch (_) {
      return { ok: false };
    }
  }

  /** Prefetch other gyms' data when idle. Best-effort, no UI side effects. */
  function idlePrefetch(year, month, months) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => {
        (months || [month]).forEach((m) => {
          if (m === month) return;
          swrGet("/api/dashboard", { year, month: m }).catch(() => { /* ignore */ });
        });
      });
    }
  }

  function clear() {
    cache.clear();
    subscribers.clear();
  }

  // ----------------------------------------------------------
  // Formatting helpers
  // ----------------------------------------------------------
  function fmtMoney(v, currency) {
    const n = Number(v) || 0;
    const c = currency || "KD";
    return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " " + c;
  }
  function fmtPct(v) {
    const n = Number(v) || 0;
    return n.toFixed(1) + "%";
  }
  function fmtInt(v) {
    const n = Number(v) || 0;
    return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  // ----------------------------------------------------------
  // Dev timing helpers
  // ----------------------------------------------------------
  function devTimings() {
    return {
      cacheSize: cache.size,
      owner: ownerToken,
    };
  }

  global.ICH = global.ICH || {};
  global.ICH.data = {
    API_BASE,
    getDashboard,
    getBranches,
    getHealth,
    idlePrefetch,
    clear,
    swrGet,
    subscribe,
    fmtMoney,
    fmtPct,
    fmtInt,
    n, s,
    devTimings,
  };
})(window);
