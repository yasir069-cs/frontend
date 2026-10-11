/* =============================================================
   data.js  (v3)
   Single data service/adapter layer.
     - SWR cache (memory + localStorage) with background
       revalidation
     - In-flight request dedupe + AbortController + stale-owner
       dropping
     - Streaming JSON parse (TextDecoderStream + incremental
       top-level object extraction) so the UI can paint before
       the response body finishes
     - Parallel per-month fetch + merge (prev/next month context
       for deltas and sparkline continuity)
     - Pending-branch isolation enforced client-side
     - Legacy backend shape tolerated; foreign payloads silently
       fall back to deterministic demo data
   ============================================================= */

"use strict";

import { BRANCHES, ACTIVE_CODES, PENDING_CODES, REVENUE_KEYS } from "./themes.js";
import { getDemoDashboard } from "./demo.js";

const API_BASE =
  (typeof window !== "undefined" && window.ICH_API_BASE) || "http://localhost:8030";

const DEFAULT_TIMEOUT = 12000;
const FRESH_TTL = 30000;
const LS_PREFIX = "ichdash.v3.";
const LS_MAX_ENTRIES = 12;

// ----------------------------------------------------------
// Numeric guards
// ----------------------------------------------------------
export function n(v, d) {
  if (v == null || v === "") return d == null ? 0 : d;
  const num = Number(v);
  if (!isFinite(num) || isNaN(num)) return d == null ? 0 : d;
  return num;
}

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }

function pad2(v) { return (v < 10 ? "0" : "") + v; }
export function monthKey(year, month) { return year + "-" + pad2(month); }

// ----------------------------------------------------------
// SWR cache
// ----------------------------------------------------------
const mem = new Map(); // key -> { ts, data, promise, inflight }
let ownerToken = 0;
function newOwner() { ownerToken += 1; return ownerToken; }
function isCurrent(token) { return token === ownerToken; }

function cacheKey(path, params) {
  const qp = Object.keys(params || {})
    .sort()
    .map((k) => k + "=" + encodeURIComponent(params[k]))
    .join("&");
  return "v3:" + path + "?" + qp;
}

function lsRead(key) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.data) return parsed;
  } catch (_) { /* ignore */ }
  return null;
}

function lsWrite(key, data) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    // Prune oldest entries if over budget.
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(LS_PREFIX) === 0) keys.push(k);
    }
    if (keys.length > LS_MAX_ENTRIES) {
      keys
        .map((k) => ({ k, ts: (lsRead(k.slice(LS_PREFIX.length)) || {}).ts || 0 }))
        .sort((a, b) => a.ts - b.ts)
        .slice(0, keys.length - LS_MAX_ENTRIES)
        .forEach((x) => { try { localStorage.removeItem(x.k); } catch (_) { /* ignore */ } });
    }
  } catch (_) { /* quota/private mode — ignore */ }
}

const subscribers = new Map();
export function subscribe(key, fn) {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(fn);
  return () => subscribers.get(key).delete(fn);
}
function notify(key, data) {
  const set = subscribers.get(key);
  if (set) set.forEach((fn) => { try { fn(data); } catch (_) { /* ignore */ } });
}

// ----------------------------------------------------------
// Streaming JSON
//   Extracts complete top-level objects while the body streams
//   so the app can paint sections early. Falls back to a plain
//   .json() when ReadableStream/TextDecoderStream is missing.
// ----------------------------------------------------------
async function fetchStreamJSON(url, signal, onPartial) {
  const res = await fetch(url, { cache: "no-store", signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error("HTTP " + res.status);

  if (!res.body || typeof TextDecoderStream === "undefined" || !onPartial) {
    return res.json();
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  const emitted = new Set();
  let scanFrom = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += value;
    // Try to emit any complete top-level "key": { … } objects.
    let found = true;
    while (found) {
      found = false;
      let i = scanFrom;
      let inStr = false;
      let esc = false;
      let depth = 0;
      let keyStart = -1;
      let objStart = -1;
      for (; i < buf.length; i++) {
        const ch = buf[i];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === "\\") esc = true;
          else if (ch === '"') inStr = false;
          continue;
        }
        if (ch === '"') { inStr = true; continue; }
        if (depth === 0) {
          if (ch === '"' && keyStart === -1) keyStart = i;
          if (ch === ":" && keyStart !== -1 && objStart === -1) {
            // key candidate; expect '{' next (objects only)
            let j = i + 1;
            while (j < buf.length && /\s/.test(buf[j])) j++;
            if (buf[j] === "{") { objStart = j; depth = 1; i = j; }
            else keyStart = -1;
          }
          continue;
        }
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0 && objStart !== -1) {
            const key = buf.slice(keyStart + 1, buf.indexOf('"', keyStart + 1));
            if (!emitted.has(key)) {
              const candidate = buf.slice(objStart, i + 1);
              try {
                const parsed = JSON.parse(candidate);
                emitted.add(key);
                onPartial(key, parsed);
              } catch (_) { /* incomplete — retry after next chunk */ }
            }
            keyStart = -1;
            objStart = -1;
            depth = 0;
            scanFrom = i + 1;
            found = true;
          }
        }
      }
      if (!found) {
        // Rewind scanFrom if a candidate object is still open.
        scanFrom = objStart !== -1 ? Math.min(scanFrom, keyStart === -1 ? objStart : keyStart) : Math.max(scanFrom, Math.max(0, i - 1));
      }
    }
  }
  return JSON.parse(buf);
}

// ----------------------------------------------------------
// Core fetch with timeout + retry/backoff
// ----------------------------------------------------------
async function fetchJSON(url, opts) {
  const timeout = (opts && opts.timeout) || DEFAULT_TIMEOUT;
  const retries = opts && opts.retries != null ? opts.retries : 2;
  const token = opts && opts.token;
  const onPartial = opts && opts.onPartial;
  let attempt = 0;
  let lastErr = null;

  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const data = await fetchStreamJSON(url, controller.signal, onPartial);
      clearTimeout(timer);
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (token !== undefined && !isCurrent(token)) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      lastErr = err;
      attempt += 1;
      if (attempt > retries) break;
      const wait = Math.min(2500, 250 * Math.pow(2, attempt)) + Math.random() * 120;
      await new Promise((res) => setTimeout(res, wait));
    }
  }
  throw lastErr || new Error("Network error");
}

// ----------------------------------------------------------
// SWR get
// ----------------------------------------------------------
function swrGet(path, params, opts) {
  const key = cacheKey(path, params);
  const hit = mem.get(key);
  const token = newOwner();
  const o = opts || {};

  const fire = (retries) =>
    fetchJSON(API_BASE + path + "?" + new URLSearchParams(params || {}).toString(), {
      timeout: o.timeout || DEFAULT_TIMEOUT,
      retries,
      token,
      onPartial: o.onPartial,
    });

  if (hit && !o.force) {
    const fresh = Date.now() - hit.ts <= FRESH_TTL;
    if (!fresh && !hit.inflight) {
      hit.inflight = true;
      fire(1)
        .then((raw) => {
          const norm = o.normalize ? o.normalize(raw) : raw;
          if (norm) {
            hit.data = norm;
            hit.ts = Date.now();
            o.persist && o.persist(norm);
            notify(key, norm);
          }
        })
        .catch(() => { /* silent background */ })
        .finally(() => { hit.inflight = false; });
    }
    return Promise.resolve({ key, data: hit.data, fresh, token });
  }

  if (hit && hit.promise && !o.force) {
    return hit.promise;
  }

  // Stale-while-revalidate from localStorage: instant paint with
  // cached real data, revalidated in the background.
  if (!hit && !o.force) {
    const lsHit = lsRead(key);
    if (lsHit && lsHit.data) {
      const slot0 = { ts: lsHit.ts || 0, data: lsHit.data, inflight: true };
      mem.set(key, slot0);
      fire(1)
        .then((raw) => {
          const norm = o.normalize ? o.normalize(raw) : raw;
          if (norm) {
            slot0.data = norm;
            slot0.ts = Date.now();
            o.persist && o.persist(norm);
            notify(key, norm);
          }
        })
        .catch(() => { /* silent background */ })
        .finally(() => { slot0.inflight = false; });
      return Promise.resolve({ key, data: lsHit.data, fresh: false, token });
    }
  }

  const slot = hit || { ts: 0, data: null, inflight: true };
  slot.inflight = true;
  mem.set(key, slot);

  // One retry on the cold path so a failing/slow backend falls
  // back to demo data quickly instead of stacking attempts.
  const p = fire(1)
    .then((raw) => {
      const norm = o.normalize ? o.normalize(raw) : raw;
      if (!norm) throw new Error("incompatible");
      slot.data = norm;
      slot.ts = Date.now();
      slot.inflight = false;
      o.persist && o.persist(norm);
      notify(key, norm);
      return { key, data: norm, fresh: true, token };
    })
    .catch((err) => {
      slot.inflight = false;
      if (!hit) mem.delete(key);
      throw err;
    });
  slot.promise = p;
  return p;
}

// ----------------------------------------------------------
// Normalization
// ----------------------------------------------------------
const LEGACY_REV_MAP = {
  Receipt: "RECEIPT", receipt: "RECEIPT",
  Daily: "DAILY", daily: "DAILY",
  Lockers: "LOCKERS", lockers: "LOCKERS",
  Personal: "PERSONAL", personal: "PERSONAL",
  Protein: "PROTEIN", protein: "PROTEIN",
};

function unitNameFrom(code) {
  const b = BRANCHES.find((x) => x.code === code);
  return b ? { name_en: b.name_en, name_ar: b.name_ar } : null;
}

/**
 * Normalize any supported backend payload into the canonical
 * v3 model. Returns null when the payload carries no active ICH
 * branch at all (foreign/legacy deployment) — callers then use
 * the demo fallback.
 */
export function normalizeDashboard(raw, year, month) {
  if (!raw || typeof raw !== "object") return null;
  let payload = raw;
  if (payload.success && payload.data && typeof payload.data === "object") {
    payload = payload.data;
  }

  // ---- sales_units ----
  const rawUnits = Array.isArray(payload.sales_units) ? payload.sales_units : [];
  const units = [];
  for (const u of rawUnits) {
    if (!u) continue;
    const code = String(u.code || "");
    if (!unitNameFrom(code)) continue; // drop non-registry codes
    const meta = unitNameFrom(code);
    const isPending = PENDING_CODES.indexOf(code) !== -1 || !!u.is_pending;
    const sales = n(u.sales);
    const target = n(u.target);
    const achievementPct = u.achievement_pct != null
      ? n(u.achievement_pct)
      : target > 0 ? round2((sales / target) * 100) : 0;
    units.push({
      code,
      name_en: u.name_en || (meta && meta.name_en) || code,
      name_ar: u.name_ar || (meta && meta.name_ar) || code,
      sales,
      transactions: n(u.transactions),
      customers: u.customers == null ? null : n(u.customers),
      target,
      achievement_pct: achievementPct,
      status: String(u.status || "online"),
      is_pending: isPending,
    });
  }

  const active = units.filter((u) => !u.is_pending && ACTIVE_CODES.indexOf(u.code) !== -1);
  if (active.length === 0) return null; // foreign deployment → demo fallback

  // Inject pending branches (visibility only, zero data).
  PENDING_CODES.forEach((code) => {
    if (!units.some((u) => u.code === code)) {
      const meta = unitNameFrom(code);
      units.push({
        code,
        name_en: meta.name_en,
        name_ar: meta.name_ar,
        sales: 0,
        transactions: 0,
        customers: null,
        target: 0,
        achievement_pct: 0,
        status: "pending",
        is_pending: true,
      });
    }
  });
  // Stable display order: registry order.
  units.sort((a, b) => BRANCHES.findIndex((x) => x.code === a.code) - BRANCHES.findIndex((x) => x.code === b.code));

  // ---- kpis (enforce pending isolation defensively) ----
  const kpiSales = round2(active.reduce((s, u) => s + u.sales, 0));
  const kpiTx = active.reduce((s, u) => s + u.transactions, 0);
  const custVals = active.map((u) => u.customers).filter((v) => v != null);
  const kpiCustomers = custVals.length ? custVals.reduce((s, v) => s + v, 0) : null;
  const kpis = {
    sales: kpiSales,
    transactions: kpiTx,
    customers: kpiCustomers,
    aov: kpiTx > 0 ? round2(kpiSales / kpiTx) : 0,
  };

  // ---- daily ----
  const rawDaily = Array.isArray(payload.daily) ? payload.daily : [];
  const daily = rawDaily
    .filter((r) => r && r.date)
    .map((r) => ({
      date: String(r.date),
      sales: n(r.sales != null ? r.sales : r.combined),
      transactions: n(r.transactions),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  // ---- monthly (12 ordered rows for the year) ----
  const rawMonthly = Array.isArray(payload.monthly) ? payload.monthly : [];
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    const key = monthKey(year, m);
    const row = rawMonthly.find((r) => r && (r.month === key || r.month === m));
    const sales = row ? n(row.sales != null ? row.sales : row.combined) : 0;
    const target = row ? n(row.target) : 0;
    monthly.push({
      month: key,
      sales: round2(sales),
      transactions: row ? n(row.transactions) : 0,
      target: Math.round(target),
      achievement_pct: target > 0 ? round2((sales / target) * 100) : 0,
    });
  }

  // ---- revenue ----
  const rawRev = payload.revenue || {};
  const rawSources = rawRev.sources && typeof rawRev.sources === "object" ? rawRev.sources : {};
  const sources = {};
  REVENUE_KEYS.forEach((k) => { sources[k] = 0; });
  Object.keys(rawSources).forEach((k) => {
    const target = LEGACY_REV_MAP[k] || (REVENUE_KEYS.indexOf(k) !== -1 ? k : null);
    if (target) sources[target] = round2(sources[target] + n(rawSources[k]));
  });
  const revenue = {
    sources,
    partial: !!rawRev.partial,
    total: rawRev.total != null ? round2(rawRev.total) : round2(REVENUE_KEYS.reduce((s, k) => s + sources[k], 0)),
  };

  // ---- today ----
  const rawToday = payload.today || {};
  const today = {
    date: String(rawToday.date || ""),
    sales: n(rawToday.sales),
    transactions: n(rawToday.transactions),
  };

  return { year, month, month_key: monthKey(year, month), kpis, sales_units: units, daily, monthly, revenue, today };
}

// ----------------------------------------------------------
// Per-unit revenue mix (deterministic estimate)
//   The documented backend contract exposes revenue only at the
//   consolidated level, so the per-branch stacked bars use a
//   deterministic estimate derived from (code, year, month)
//   unless the backend later provides u.revenue.sources.
// ----------------------------------------------------------
const MIX_BIAS = {
  stretch_men:     [0.52, 0.18, 0.12, 0.12, 0.06],
  stretch_ladies:  [0.47, 0.20, 0.14, 0.13, 0.06],
  the_gym_mishref: [0.38, 0.27, 0.13, 0.15, 0.07],
  ihc_express:     [0.44, 0.22, 0.15, 0.12, 0.07],
  default:         [0.45, 0.20, 0.15, 0.13, 0.07],
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function partition1(total, weights) {
  const cents = Math.round(total * 10);
  const sumW = weights.reduce((s, w) => s + w, 0) || 1;
  const raw = weights.map((w) => (cents * w) / sumW);
  const floor = raw.map((v) => Math.floor(v));
  let rem = cents - floor.reduce((s, v) => s + v, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (rem > 0) { floor[order[k % order.length].i] += 1; rem -= 1; k += 1; }
  return floor.map((v) => v / 10);
}

export function unitRevenueMix(unit, year, month) {
  if (!unit) return { sources: {}, estimated: true };
  // Real per-unit data wins if a future backend provides it.
  if (unit.revenue && unit.revenue.sources && typeof unit.revenue.sources === "object") {
    const src = {};
    REVENUE_KEYS.forEach((k) => { src[k] = n(unit.revenue.sources[k]); });
    return { sources: src, estimated: false };
  }
  const bias = MIX_BIAS[unit.code] || MIX_BIAS.default;
  const rng = mulberry32(hashStr(unit.code) + year * 10000 + month * 100);
  const weights = bias.map((w) => Math.max(0.01, w + (rng() - 0.5) * 0.04));
  const parts = partition1(n(unit.sales), weights);
  const src = {};
  REVENUE_KEYS.forEach((k, i) => { src[k] = parts[i]; });
  return { sources: src, estimated: true };
}

// ----------------------------------------------------------
// Range stats (client-side slicing of daily rows)
// ----------------------------------------------------------
export function rangeStats(daily, from, to) {
  const rows = (daily || []).filter((r) => (!from || r.date >= from) && (!to || r.date <= to));
  return {
    count: rows.length,
    sales: round2(rows.reduce((s, r) => s + n(r.sales), 0)),
    transactions: rows.reduce((s, r) => s + n(r.transactions), 0),
  };
}

// ----------------------------------------------------------
// Demo detection + fallback
// ----------------------------------------------------------
export function isDemoForced() {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("demo") === "1") return true;
  } catch (_) { /* ignore */ }
  return false;
}

function demoResult(year, month) {
  const norm = normalizeDashboard(getDemoDashboard(year, month), year, month);
  const pm = month - 1 < 1 ? 12 : month - 1;
  const py = month - 1 < 1 ? year - 1 : year;
  const nm = month + 1 > 12 ? 1 : month + 1;
  const ny = month + 1 > 12 ? year + 1 : year;
  return {
    data: norm,
    demo: true,
    fresh: true,
    ts: Date.now(),
    context: {
      prev: normalizeDashboard(getDemoDashboard(py, pm), py, pm),
      next: normalizeDashboard(getDemoDashboard(ny, nm), ny, nm),
    },
  };
}

function normalizeFor(year, month) {
  return (raw) => normalizeDashboard(raw, year, month);
}

/**
 * Main entry: parallel per-month fetch + merge.
 *   - selected month: authoritative render payload
 *   - prev/next months: fetched in parallel, merged as `context`
 *     (delta chips, tooltips, sparkline continuity)
 * Falls back to deterministic demo data silently whenever the
 * backend is unreachable or returns a foreign payload.
 */
export async function getDashboard(year, month, opts) {
  const o = opts || {};

  if (isDemoForced()) return demoResult(year, month);

  const onPartial = o.onPartial || null;
  const persist = (data) => lsWrite("dashboard:" + year + ":" + month, data);

  // Prev/next with year rollover.
  const pm = month - 1, py = month - 1 < 1 ? year - 1 : year;
  const nm = month + 1, ny = month + 1 > 12 ? year + 1 : year;

  const mainP = swrGet("/api/dashboard", { year, month }, {
    force: o.force,
    normalize: normalizeFor(year, month),
    persist,
    onPartial: onPartial
      ? (key, val) => {
          // Progressive paint: forward raw sections as they stream in.
          if (key === "kpis" || key === "today") onPartial(key, val);
        }
      : null,
  }).catch(() => null);

  const ctxPrevP = swrGet("/api/dashboard", { year: py, month: pm }, {
    normalize: normalizeFor(py, pm),
  }).catch(() => null);
  const ctxNextP = swrGet("/api/dashboard", { year: ny, month: nm }, {
    normalize: normalizeFor(ny, nm),
  }).catch(() => null);

  const [main, prev, next] = await Promise.all([mainP, ctxPrevP, ctxNextP]);

  if (!main || !main.data) {
    return demoResult(year, month);
  }

  // Fresh localStorage copy for instant next paint (SWR).
  return {
    data: main.data,
    demo: false,
    fresh: !!main.fresh,
    ts: Date.now(),
    context: {
      prev: prev && prev.data ? prev.data : null,
      next: next && next.data ? next.data : null,
    },
  };
}

export function readCachedDashboard(year, month) {
  const hit = lsRead("dashboard:" + year + ":" + month);
  return hit ? hit.data : null;
}

/**
 * Custom-range daily rows: fetches every month the range touches
 * in parallel (per-month fetch + merge), then slices to [from,to].
 * Falls back per-month to demo data when the backend fails, so
 * the trend always has rows to draw.
 */
export async function getDailyRange(from, to) {
  if (!from || !to || from > to) return [];
  const y0 = Number(from.slice(0, 4));
  const m0 = Number(from.slice(5, 7));
  const y1 = Number(to.slice(0, 4));
  const m1 = Number(to.slice(5, 7));
  const months = [];
  let y = y0, m = m0;
  // Guard against absurd ranges (max 24 months).
  while ((y < y1 || (y === y1 && m <= m1)) && months.length < 24) {
    months.push({ y, m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  const results = await Promise.all(
    months.map(({ y, m }) =>
      getDashboard(y, m).catch(() => null)
    )
  );
  let rows = [];
  results.forEach((r) => {
    if (r && r.data && Array.isArray(r.data.daily)) rows = rows.concat(r.data.daily);
  });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows.filter((r) => r.date >= from && r.date <= to);
}

// ----------------------------------------------------------
// Health
// ----------------------------------------------------------
export async function getHealth() {
  try {
    const r = await fetch(API_BASE + "/api/health", { cache: "no-store" });
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: !!(j && j.status === "online") };
  } catch (_) {
    return { ok: false };
  }
}

// ----------------------------------------------------------
// Idle prefetch of the next-likely month (skipped in demo mode)
// ----------------------------------------------------------
export function idlePrefetch(year, month) {
  if (isDemoForced()) return; // demo is local — nothing to prefetch
  const nm = month + 1, ny = month + 1 > 12 ? year + 1 : year;
  const run = () => {
    swrGet("/api/dashboard", { year: ny, month: nm }, { normalize: normalizeFor(ny, nm) })
      .catch(() => { /* silent */ });
  };
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 4000 });
  } else if (typeof setTimeout === "function") {
    setTimeout(run, 1500);
  }
}

// ----------------------------------------------------------
// Formatting (western digits always)
// ----------------------------------------------------------
export function fmtMoney(v) {
  const num = Number(v) || 0;
  return num.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + " KD";
}
export function fmtInt(v) {
  const num = Number(v) || 0;
  return num.toLocaleString("en-US", { maximumFractionDigits: 0 });
}
export function fmtPct(v) {
  const num = Number(v) || 0;
  return num.toFixed(1) + "%";
}
export function fmtKD(v) {
  const num = Number(v) || 0;
  if (num >= 10000) return (num / 1000).toFixed(0) + "k";
  if (num >= 1000) return (num / 1000).toFixed(1) + "k";
  return num.toFixed(0);
}

export function clearCaches() {
  mem.clear();
  subscribers.clear();
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(LS_PREFIX) === 0) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch (_) { /* ignore */ }
}

export const BASE_URL = API_BASE;
