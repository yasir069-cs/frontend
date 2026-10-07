/* =============================================================
   app.js
   Orchestrator. Wires:
     - Themes (per-gym CSS variables, logo, palette)
     - i18n (EN/AR with RTL)
     - Sidebar (desktop collapse + mobile drawer)
     - Filters (branch, period presets, custom dates, year/month)
     - Data layer (parallel fetch, SWR cache, retry/backoff)
     - Charts (line, multi-line, bars, donut)
     - Ranking (revenue-sorted, per-gym brand colors)
     - Annual report (green=0 remaining, yellow<80%, red<40%)
     - Status pill (online / syncing / offline) + last-synced
   ============================================================= */

(function () {
  "use strict";

  const ICH = window.ICH;
  const { themes, icons, i18n, data, sidebar, charts } = ICH;
  const t = i18n.t;
  const fmtMoney = data.fmtMoney;
  const fmtPct = data.fmtPct;
  const fmtInt = data.fmtInt;
  const icon = icons.icon;

  // ----------------------------------------------------------
  // App state
  // ----------------------------------------------------------
  const MONTHS = ["January","February","March","April","May","June",
                  "July","August","September","October","November","December"];
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    branch: "all",                // gym id, or "all"
    preset: "month",              // today | 15 | 30 | month | custom
    dateFrom: null,               // YYYY-MM-DD
    dateTo: null,
    lastSync: null,
    syncing: false,
  };

  // In-flight loaders + aborters
  let inflightToken = 0;
  const debouncers = {};

  // ----------------------------------------------------------
  // Utilities
  // ----------------------------------------------------------
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.from(document.querySelectorAll(sel)); }
  function el(tag, cls, html) {
    const x = document.createElement(tag);
    if (cls) x.className = cls;
    if (html != null) x.innerHTML = html;
    return x;
  }
  function debounce(key, fn, ms) {
    if (debouncers[key]) clearTimeout(debouncers[key]);
    debouncers[key] = setTimeout(() => { delete debouncers[key]; fn(); }, ms);
  }
  function setStatus(kind, text) {
    const pill = $("#statusPill");
    const txt = $("#statusPillText");
    const dot = $("#sidebarLiveDot");
    const dtxt = $("#sidebarLiveText");
    if (!pill) return;
    pill.classList.remove("syncing", "offline");
    if (kind === "syncing") pill.classList.add("syncing");
    if (kind === "offline") pill.classList.add("offline");
    if (dot) dot.classList.toggle("off", kind === "offline");
    if (dtxt) dtxt.classList.toggle("off", kind === "offline");
    txt.textContent = text;
    if (dtxt) dtxt.textContent = text;
  }
  function periodLabelText() {
    if (state.preset === "today") return t("filter_preset_today");
    if (state.preset === "15") return t("filter_preset_15");
    if (state.preset === "30") return t("filter_preset_30");
    if (state.preset === "custom") {
      const f = state.dateFrom || "—";
      const to = state.dateTo || "—";
      return `${f} → ${to}`;
    }
    return `${MONTHS[state.month - 1]} ${state.year}`;
  }

  // ----------------------------------------------------------
  // Theme application
  // ----------------------------------------------------------
  function applyThemeForBranch(branchId) {
    const theme = themes.applyTheme(branchId);
    const badgeName = $("#gymBadgeName");
    const badgeSub = $("#gymBadgeSub");
    const badgeImg = $("#gymBadge img");
    if (badgeName) badgeName.textContent = theme.shortName;
    if (badgeSub) badgeSub.textContent = theme.id === "all" ? t("all_branches") : theme.name;
    if (badgeImg) badgeImg.dataset.logoStem = theme.logo;
    themes.resolveAllLogos();
    document.title = `${theme.shortName} · ${t("app_title")}`;
  }

  // ----------------------------------------------------------
  // Filters: year/month/branch/period
  // ----------------------------------------------------------
  function buildYearMonthSelectors() {
    const ys = $("#yearSelect");
    const ms = $("#monthSelect");
    ys.innerHTML = "";
    ms.innerHTML = "";
    for (let y = 2025; y <= 2030; y++) {
      const o = el("option"); o.value = y; o.textContent = y;
      ys.appendChild(o);
    }
    MONTHS.forEach((m, i) => {
      const o = el("option"); o.value = i + 1; o.textContent = m;
      ms.appendChild(o);
    });
    ys.value = state.year;
    ms.value = state.month;
    ys.addEventListener("change", () => { state.year = +ys.value; state.preset = "month"; syncPresetChips(); load(); });
    ms.addEventListener("change", () => { state.month = +ms.value; state.preset = "month"; syncPresetChips(); load(); });
  }

  function buildBranchSelector(branches) {
    const sel = $("#branchSelect");
    sel.innerHTML = "";
    const all = el("option");
    all.value = "all";
    all.textContent = t("all_branches") + " (Force Holding Co)";
    sel.appendChild(all);

    const known = new Set((branches || []).map((b) => b.code));
    // Always include all 6 gym themes, even if backend hasn't been updated
    themes.DEFAULT_GYM_ORDER.forEach((id) => {
      const theme = themes.getTheme(id);
      const o = el("option");
      o.value = theme.id;
      o.textContent = theme.shortName + (known.has(theme.id) ? "" : " · preview");
      sel.appendChild(o);
    });
    sel.value = state.branch;
    sel.addEventListener("change", () => {
      state.branch = sel.value;
      applyThemeForBranch(state.branch);
      // Charts re-render with the new palette without refetching data
      rerenderChartsFromCache();
    });
  }

  function syncPresetChips() {
    $$("#periodPresets .chip").forEach((c) => c.classList.toggle("active", c.dataset.preset === state.preset));
    const showCustom = state.preset === "custom";
    $("#customRange").style.display = showCustom ? "" : "none";
    $("#customRangeTo").style.display = showCustom ? "" : "none";
  }

  function wirePresets() {
    $$("#periodPresets .chip").forEach((c) => {
      c.addEventListener("click", () => {
        const preset = c.dataset.preset;
        state.preset = preset;
        syncPresetChips();
        if (preset === "today") {
          const today = new Date();
          state.dateFrom = iso(today); state.dateTo = iso(today);
          load();
        } else if (preset === "15") {
          const today = new Date();
          const start = new Date(today); start.setDate(today.getDate() - 14);
          state.dateFrom = iso(start); state.dateTo = iso(today);
          load();
        } else if (preset === "30") {
          const today = new Date();
          const start = new Date(today); start.setDate(today.getDate() - 29);
          state.dateFrom = iso(start); state.dateTo = iso(today);
          load();
        } else if (preset === "custom") {
          // do nothing until dates are picked
        } else if (preset === "month") {
          load();
        }
      });
    });

    const fromEl = $("#dateFrom"), toEl = $("#dateTo");
    fromEl.addEventListener("change", () => {
      state.dateFrom = fromEl.value || null;
      if (state.dateFrom && state.dateTo) load();
    });
    toEl.addEventListener("change", () => {
      state.dateTo = toEl.value || null;
      if (state.dateFrom && state.dateTo) load();
    });
  }

  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // ----------------------------------------------------------
  // Skeleton helpers
  // ----------------------------------------------------------
  function skeletonKpis() {
    return [1,2,3,4].map(() =>
      `<div class="kpi"><div class="kpi-head"><div class="kpi-label skeleton k-line" style="width:80px"></div></div>
       <div class="kpi-value skeleton k-line" style="width:60%"></div>
       <div class="kpi-sub"><span class="skeleton k-pill"></span></div></div>`
    ).join("");
  }
  function skeletonRow() {
    return `<div class="ranking-row" style="opacity:.6">
      <div class="skeleton k-pill"></div><div class="skeleton k-pill"></div>
      <div><div class="skeleton k-line" style="width:60%"></div><div class="skeleton k-line" style="width:40%;margin-top:6px"></div></div>
      <div class="skeleton k-pill"></div>
    </div>`;
  }
  function skeletonTable() {
    return Array.from({ length: 8 }).map(() =>
      `<tr><td><div class="skeleton k-line" style="width:60%"></div></td>
           <td><div class="skeleton k-line" style="width:80%"></div></td>
           <td><div class="skeleton k-line" style="width:70%"></div></td>
           <td><div class="skeleton k-line" style="width:50%"></div></td>
           <td><div class="skeleton k-line" style="width:80%"></div></td></tr>`
    ).join("");
  }

  // ----------------------------------------------------------
  // Error boundary per widget
  // ----------------------------------------------------------
  function widgetError(message) {
    return `<div class="error-box">
      <span>${icon("alert")} <span style="margin-inline-start:8px">${message}</span></span>
      <button data-retry="1">${t("action_retry")}</button>
    </div>`;
  }
  function widgetRetry(node, fn) {
    const btn = node.querySelector("[data-retry]");
    if (btn) btn.addEventListener("click", fn);
  }

  // ----------------------------------------------------------
  // KPI rendering
  // ----------------------------------------------------------
  function kpiCards(d) {
    if (!d) return widgetError(t("t_offline_msg"));
    const branchUnits = filterUnitsForBranch(d);
    const unit = state.branch === "all" ? null : state.branch;
    const sales = unit ? Number(branchUnits[0]?.sales || 0) : Number(d.kpis.sales || 0);
    const target = unit ? Number(branchUnits[0]?.target || 0) : Number(d.kpis.target || 0);
    const tx = unit ? Number(branchUnits[0]?.transactions || 0) : Number(d.kpis.transactions || 0);
    const achievement = target ? (sales / target) * 100 : 0;
    const remaining = Math.max(target - sales, 0);
    const avg = tx ? sales / tx : 0;
    const daysRem = Number(d.kpis.days_remaining || 0);
    const required = daysRem > 0 ? remaining / daysRem : 0;
    const todaySales = Number(d.today?.sales || 0);
    const todayTx = Number(d.today?.transactions || 0);
    const prev = previousPeriodSnapshot();
    const dSales = prev ? (sales - prev.sales) : 0;
    const dSalesPct = prev && prev.sales > 0 ? (dSales / prev.sales) * 100 : null;
    const dTx = prev ? (tx - prev.tx) : 0;
    const dTxPct = prev && prev.tx > 0 ? (dTx / prev.tx) * 100 : null;

    function deltaCls(p) {
      if (p == null) return "flat";
      if (p > 0.5) return "";
      if (p < -0.5) return "down";
      return "flat";
    }
    function deltaText(p) {
      if (p == null) return "—";
      const arrow = p >= 0 ? "▲" : "▼";
      return `${arrow} ${Math.abs(p).toFixed(1)}%`;
    }

    const cards = [
      { label: t("kpi_today_sales"), value: fmtMoney(todaySales), sub: t("t_transactions", { n: fmtInt(todayTx) }), icon: "bolt", accent: 0 },
      { label: t("kpi_month_sales"), value: fmtMoney(sales), sub: periodLabelText(), icon: "money", accent: 1, delta: { cls: deltaCls(dSalesPct), text: deltaText(dSalesPct) } },
      { label: t("kpi_target"), value: fmtMoney(target), sub: state.branch === "all" ? t("t_kpi_sub_unit_all") : t("t_kpi_sub_unit_one"), icon: "target", accent: 2 },
      { label: t("kpi_achievement"), value: fmtPct(achievement), sub: achievement >= 100 ? t("t_target_reached") : t("t_kpi_sub_balance"), icon: "check", accent: 3 },
      { label: t("kpi_remaining"), value: fmtMoney(remaining), sub: remaining > 0 ? t("t_kpi_sub_balance") : t("t_target_reached"), icon: "alert", accent: 4 },
      { label: t("kpi_required"), value: fmtMoney(required), sub: daysRem > 0 ? t("t_days_remaining", { n: daysRem }) : t("t_month_complete"), icon: "calendar", accent: 5 },
      { label: t("kpi_transactions"), value: fmtInt(tx), sub: t("t_kpi_sub_selected_period"), icon: "users", accent: 6, delta: { cls: deltaCls(dTxPct), text: deltaText(dTxPct) } },
      { label: t("kpi_avg"), value: fmtMoney(avg), sub: t("t_avg", { v: fmtMoney(avg) }), icon: "star", accent: 7 },
    ];

    return cards.map((c) => `
      <div class="kpi accent-${c.accent}" role="group" aria-label="${c.label}">
        <div class="kpi-head">
          <div class="kpi-label">${c.label}</div>
          <div class="kpi-icon">${icon(c.icon, 18)}</div>
        </div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-sub">
          <span>${c.sub}</span>
          ${c.delta ? `<span class="delta ${c.delta.cls}">${c.delta.text}</span>` : ""}
        </div>
      </div>
    `).join("");
  }

  // ----------------------------------------------------------
  // Branch / unit helpers
  // ----------------------------------------------------------
  function filterUnitsForBranch(d) {
    if (!d || !d.sales_units) return [];
    if (state.branch === "all") return d.sales_units;
    return d.sales_units.filter((u) => u.code === state.branch);
  }

  // Cache previous values so the KPI delta chip is meaningful.
  function previousPeriodSnapshot() {
    const key = "ich.prev." + state.branch + "." + state.year + "." + state.month;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* ignore */ }
    return null;
  }
  function savePreviousPeriodSnapshot(sales, tx) {
    const key = "ich.prev." + state.branch + "." + state.year + "." + state.month;
    try { sessionStorage.setItem(key, JSON.stringify({ sales, tx })); } catch (_) { /* ignore */ }
  }

  // ----------------------------------------------------------
  // Trend chart (single gym or combined)
  // ----------------------------------------------------------
  function renderTrend(d) {
    if (!d) return;
    const note = $("#trendNote");
    note.textContent = periodLabelText();
    const canvas = $("#dailyChart");
    const rows = d.daily || [];
    if (state.branch === "all") {
      // Multi-line: one line per known branch in their own brand color
      const allThemes = themes.DEFAULT_GYM_ORDER.map((id) => themes.getTheme(id));
      const series = allThemes.map((th) => ({
        name: th.shortName,
        color: th.primary,
        data: rows.map((r) => r[th.id] != null ? Number(r[th.id]) : null),
      }));
      charts.multiLine(canvas, {
        series,
        labels: rows.map((r, i) => r.date ? r.date.slice(8, 10) : (i + 1)),
      });
      // legend
      const legend = $("#dailyLegend");
      legend.innerHTML = series.map((s) => `<span class="item"><span class="swatch" style="background:${s.color}"></span>${s.name}</span>`).join("");
    } else {
      const series = rows.map((r) => r[state.branch] != null ? Number(r[state.branch]) : (r.combined != null ? Number(r.combined) : null));
      charts.line(canvas, {
        series,
        labels: rows.map((r, i) => r.date ? r.date.slice(8, 10) : (i + 1)),
      });
      $("#dailyLegend").innerHTML = `<span class="item">${icon("bolt", 14)} ${periodLabelText()}</span>`;
    }
  }

  // ----------------------------------------------------------
  // Monthly chart (actual vs target) + 2026 annual table
  // ----------------------------------------------------------
  function renderMonthly(d) {
    if (!d) return;
    const rows = d.monthly || [];
    $("#monthlyNote").textContent = state.year;
    const a = rows.map((r) => Number(r.combined || 0));
    const t = rows.map((r) => Number(r.target || 0));
    charts.groupedBars($("#monthlyChart"), {
      labels: MONTHS_SHORT,
      actual: a,
      target: t,
    });

    // Annual table — per spec: green when remaining is 0, yellow below 80%, red below 40%.
    const tbody = $("#annualTbody");
    tbody.innerHTML = rows.map((r, i) => {
      const actual = Number(r.combined || 0);
      const target = Number(r.target || 0);
      const remaining = Math.max(target - actual, 0);
      const pct = target ? (actual / target) * 100 : 0;
      let cls = "good";
      if (remaining > 0) {
        if (pct < 40) cls = "bad";
        else if (pct < 80) cls = "warn";
      }
      return `<tr>
        <td>${MONTHS[i]}</td>
        <td class="right">${fmtMoney(actual)}</td>
        <td class="right">${target ? fmtMoney(target) : '<span class="muted">—</span>'}</td>
        <td class="right ${cls}">${target ? fmtPct(pct) : '<span class="muted">—</span>'}</td>
        <td class="right">${target ? fmtMoney(remaining) : '<span class="muted">—</span>'}</td>
      </tr>`;
    }).join("");
    $("#annualNote").textContent = state.year;
  }

  // ----------------------------------------------------------
  // Ranking
  // ----------------------------------------------------------
  function renderRanking(d) {
    if (!d) return;
    const units = (d.sales_units || []).slice();
    units.sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0));
    const wrap = $("#rankingList");
    if (units.length === 0) {
      wrap.innerHTML = `<div class="empty">No branch data</div>`;
      return;
    }
    wrap.innerHTML = units.map((u, i) => {
      const theme = themes.getTheme(u.code);
      const rankCls = i === 0 ? "rank top" : "rank";
      return `<div class="ranking-row" data-branch="${u.code}" role="button" tabindex="0">
        <div class="${rankCls}">#${i + 1}</div>
        <div class="logo-cell"><img alt="${theme.shortName}" data-logo-stem="${theme.logo}"></div>
        <div class="meta">
          <b>${theme.shortName}</b>
          <small>${theme.name} · ${i18n.revLabel("Receipt")}: ${fmtPct(100)}</small>
        </div>
        <div class="amount">
          <b>${fmtMoney(u.sales)}</b>
          <small>${u.transactions} ${t("kpi_transactions").toLowerCase()}</small>
        </div>
      </div>`;
    }).join("");
    themes.resolveAllLogos(wrap);
    // Click to drill into a single branch
    wrap.querySelectorAll(".ranking-row").forEach((row) => {
      row.addEventListener("click", () => {
        const code = row.dataset.branch;
        if (!code) return;
        state.branch = code;
        $("#branchSelect").value = code;
        applyThemeForBranch(code);
        rerenderChartsFromCache();
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); }
      });
    });
  }

  // ----------------------------------------------------------
  // Revenue source breakdown
  // ----------------------------------------------------------
  function renderRevenue(d) {
    if (!d) return;
    const r = d.revenue;
    const grid = $("#revenueGrid");
    const note = $("#revenueNote");
    note.textContent = periodLabelText();
    if (!r) {
      grid.innerHTML = `<div class="empty">${t("t_no_revenue")}</div>`;
      $("#revenuePartial").innerHTML = "";
      return;
    }
    const sources = r.sources || {};
    const total = Object.values(sources).reduce((s, v) => s + Number(v || 0), 0) || 1;
    const ordered = ["Receipt", "Daily", "Personal", "Protein"]
      .filter((k) => sources[k] != null);
    grid.innerHTML = ordered.map((k) => {
      const v = Number(sources[k] || 0);
      const pct = (v / total) * 100;
      return `<div class="rev-card">
        <div class="name">${i18n.revLabel(k)}</div>
        <div class="value">${fmtMoney(v)}</div>
        <div class="pct">${fmtPct(pct)} of sources</div>
      </div>`;
    }).join("") || `<div class="empty">${t("t_no_revenue")}</div>`;

    $("#revenuePartial").innerHTML = r.partial
      ? `<div class="partial">${icon("alert")} ${t("t_revenue_partial")}</div>`
      : "";

    // Donut
    const colorMap = {
      Receipt: themes.getTheme("stretch_men").primary,
      Daily: themes.getTheme("ihc_express").accent,
      Personal: themes.getTheme("the_gym_mishref").primary,
      Protein: themes.getTheme("ihc_jahra").accent,
    };
    charts.donut($("#revenueChart"), {
      data: ordered.map((k) => ({
        label: i18n.revLabel(k),
        value: sources[k],
        color: colorMap[k],
      })),
    });
  }

  // ----------------------------------------------------------
  // Units
  // ----------------------------------------------------------
  function renderUnits(d) {
    if (!d) return;
    const units = filterUnitsForBranch(d);
    $("#unitNote").textContent = t("t_units", { n: units.length });
    const grid = $("#unitsGrid");
    grid.innerHTML = units.map((u) => {
      const a = Number(u.achievement || 0);
      const width = Math.min(a, 100);
      const status = (u.status || "unknown").toLowerCase();
      const statusClass = status === "online" ? "" : "off";
      return `<div class="unit">
        <div class="unit-head">
          <div class="unit-name">${u.name}</div>
          <div class="unit-status ${statusClass}">${status}</div>
        </div>
        <div class="unit-sales">${fmtMoney(u.sales)}</div>
        <div class="bar"><span style="width:${width}%"></span></div>
        <div class="unit-meta">
          <span>${t("t_target", { v: fmtMoney(u.target) })}</span>
          <span>${fmtPct(a)}</span>
        </div>
        <div class="unit-meta">
          <span>${u.transactions} ${t("kpi_transactions").toLowerCase()}</span>
          <span>${t("t_avg", { v: fmtMoney(u.average_transaction) })}</span>
        </div>
      </div>`;
    }).join("");
  }

  // ----------------------------------------------------------
  // Main render
  // ----------------------------------------------------------
  let lastData = null;

  function rerenderChartsFromCache() {
    if (!lastData) return;
    renderAll(lastData, true);
  }

  function renderAll(d, fromCache) {
    lastData = d;
    savePreviousPeriodSnapshot(d.kpis.sales, d.kpis.transactions);
    $("#periodLabel").textContent = periodLabelText();
    $("#kpiGrid").innerHTML = kpiCards(d);
    renderTrend(d);
    renderRanking(d);
    renderRevenue(d);
    renderMonthly(d);
    renderUnits(d);
  }

  // ----------------------------------------------------------
  // Data loader
  // ----------------------------------------------------------
  async function load() {
    setStatus("syncing", t("status_syncing"));
    state.syncing = true;
    inflightToken += 1;
    const myToken = inflightToken;

    // Skeletons on cold load
    if (!lastData) {
      $("#kpiGrid").innerHTML = skeletonKpis();
      $("#rankingList").innerHTML = skeletonRow() + skeletonRow() + skeletonRow();
      $("#revenueGrid").innerHTML = skeletonRow();
      $("#unitsGrid").innerHTML = skeletonRow() + skeletonRow();
      $("#annualTbody").innerHTML = skeletonTable();
    }

    // Parallel: dashboard + branches + health
    const [dashRes, brRes, health] = await Promise.all([
      data.getDashboard(state.year, state.month).catch((e) => ({ error: e })),
      data.getBranches().catch((e) => ({ error: e })),
      data.getHealth(),
    ]);

    // If a newer load started, drop this one
    if (myToken !== inflightToken) return;

    if (dashRes.error || !dashRes.data) {
      // Show cached if we have any
      if (lastData) {
        setStatus("offline", t("status_offline"));
        $("#errorSlot").innerHTML = widgetError(t("t_offline_msg") + " — " + (dashRes.error && dashRes.error.message ? dashRes.error.message : ""));
        widgetRetry($("#errorSlot"), load);
      } else {
        setStatus("offline", t("status_offline"));
        $("#kpiGrid").innerHTML = widgetError(t("t_offline_msg"));
        widgetRetry($("#kpiGrid"), load);
        $("#errorSlot").innerHTML = "";
      }
      state.syncing = false;
      return;
    }

    if (brRes && brRes.data && brRes.data.branches && !$("#branchSelect").options.length) {
      buildBranchSelector(brRes.data.branches);
    }

    state.lastSync = new Date();
    setStatus(health && health.ok ? "online" : "syncing", health && health.ok ? `${t("status_online")} · ${state.lastSync.toLocaleTimeString()}` : t("status_syncing"));
    $("#errorSlot").innerHTML = "";
    renderAll(dashRes.data, !!dashRes.isFresh === false);
    state.syncing = false;

    // Best-effort idle prefetch of adjacent months
    const others = [state.month - 1, state.month + 1].filter((m) => m >= 1 && m <= 12);
    data.idlePrefetch(state.year, state.month, others);
  }

  // ----------------------------------------------------------
  // Icons: hydrate every [data-icon] element
  // ----------------------------------------------------------
  function hydrateIcons() {
    $$("[data-icon]").forEach((el) => { el.innerHTML = icon(el.dataset.icon, 18); });
  }

  // ----------------------------------------------------------
  // Language toggle
  // ----------------------------------------------------------
  function wireLang() {
    const btn = $("#langToggle");
    btn.addEventListener("click", () => {
      const next = i18n.getLang() === "en" ? "ar" : "en";
      i18n.setLang(next);
      $("#langToggleText").textContent = i18n.getLang() === "en" ? "العربية" : "English";
      rerenderChartsFromCache();
    });
    i18n.onChange(() => {
      // Re-apply all i18n-able attributes
      $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
      // Refresh dynamic bits
      if (lastData) rerenderChartsFromCache();
    });
  }

  // ----------------------------------------------------------
  // Refresh button
  // ----------------------------------------------------------
  function wireRefresh() {
    const btn = $("#refreshBtn");
    btn.addEventListener("click", () => {
      const svg = btn.querySelector("svg");
      if (svg) svg.classList.add("spin");
      load().finally(() => { if (svg) svg.classList.remove("spin"); });
    });
  }

  // ----------------------------------------------------------
  // Keyboard shortcuts
  // ----------------------------------------------------------
  function wireShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
      if (e.key === "r" || e.key === "R") { e.preventDefault(); $("#refreshBtn").click(); }
      if (e.key === "b" || e.key === "B") { e.preventDefault(); $('[data-action="toggle-sidebar"]').click(); }
      if (e.key === "/") { e.preventDefault(); $("#branchSelect").focus(); }
    });
  }

  // ----------------------------------------------------------
  // Auto-refresh every 60s (silent, no skeletons)
  // ----------------------------------------------------------
  function wireAutoRefresh() {
    setInterval(() => {
      if (document.hidden) return;
      load();
    }, 60_000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && state.lastSync && (Date.now() - state.lastSync.getTime() > 90_000)) {
        load();
      }
    });
  }

  // ----------------------------------------------------------
  // Boot
  // ----------------------------------------------------------
  function boot() {
    // 1. Hydrate inline icon placeholders
    hydrateIcons();
    // 2. Apply default theme
    applyThemeForBranch(state.branch);
    // 3. Build year/month selectors
    buildYearMonthSelectors();
    // 4. Wire filter chips + dates
    wirePresets();
    // 5. Wire language + refresh
    wireLang();
    wireRefresh();
    // 6. Wire sidebar
    sidebar.init({ onNav: () => { /* future routing hook */ } });
    // 7. Wire keyboard shortcuts
    wireShortcuts();
    // 8. First load
    load();
    // 9. Auto-refresh
    wireAutoRefresh();
    // 10. Dev-only timing hook
    if (window.__ICH_DEV__) {
      setInterval(() => {
        const t = data.devTimings();
        console.debug("[ICH] cache", t);
      }, 5000);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
