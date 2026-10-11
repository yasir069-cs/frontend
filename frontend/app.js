/* =============================================================
   app.js  (v3) — entry point (esbuild bundles this)
   Orchestrates: themes, i18n, sidebar, listboxes, range filter,
   data layer, charts, tickers, confetti, keyboard shortcuts.
   ============================================================= */

"use strict";

import * as themes from "./themes.js";
import * as i18n from "./i18n.js";
import { icon, hydrateIcons } from "./icons.js";
import * as data from "./data.js";
import * as charts from "./charts.js";
import { createListbox } from "./components/listbox.js";
import { tick } from "./components/ticker.js";
import { burstAt } from "./confetti.js";
import { initSidebar } from "./sidebar.js";

const t = i18n.t;
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const REVENUE_KEYS = themes.REVENUE_KEYS;

// ----------------------------------------------------------
// State
// ----------------------------------------------------------
const now = new Date();
const state = {
  year: now.getFullYear(),
  month: now.getMonth() + 1,
  branch: "all",
  lastResult: null,
  lastData: null,
};

// Revenue Trend period preset: month | today | 15 | 30 | custom
const trendState = { preset: "month", from: null, to: null, customRows: null, customKey: "" };

let branchLb = null;
let bfcacheRestore = false;

const kpiPrev = new Map(); // key -> last shown numeric value
const lastHtml = new Map(); // container id -> last innerHTML (skip unchanged)
const celebrated = new Set(); // branch codes that already fired confetti

// ----------------------------------------------------------
// Small helpers
// ----------------------------------------------------------
function setHtmlIfChanged(id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  if (lastHtml.get(id) === html) return;
  lastHtml.set(id, html);
  el.innerHTML = html;
}

function num(v) { const x = Number(v); return isFinite(x) ? x : 0; }

/** Escape dynamic text before it is inserted via innerHTML. */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }

function isCurrentRealMonth() {
  const t = new Date();
  return state.year === t.getFullYear() && state.month === t.getMonth() + 1;
}

function periodLabel() {
  return i18n.monthName(state.month) + " " + state.year;
}

function branchName(unit) {
  return i18n.getLang() === "ar" ? unit.name_ar : unit.name_en;
}

function activeUnits(d) {
  return (d.sales_units || []).filter((u) => !u.is_pending);
}

function pendingUnits(d) {
  return (d.sales_units || []).filter((u) => u.is_pending);
}

function scopedUnit(d) {
  if (state.branch === "all") return null;
  return (d.sales_units || []).find((u) => u.code === state.branch) || null;
}

function deltaChip(cur, prev) {
  if (prev == null || prev === 0 || cur == null) return "";
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (!isFinite(pct)) return "";
  const cls = pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat";
  const arrow = pct >= 0 ? "▲" : "▼";
  return '<span class="delta ' + cls + '">' + arrow + " " + Math.abs(pct).toFixed(1) + "%</span>";
}

function annualTitle() {
  const base = t("sec_annual");
  return state.year === 2026 ? base : base.replace("2026", String(state.year));
}

// ----------------------------------------------------------
// Status pills
// ----------------------------------------------------------
function setStatus(kind, text) {
  const pill = $("#statusPill");
  if (!pill) return;
  pill.classList.remove("syncing", "offline");
  if (kind === "syncing") pill.classList.add("syncing");
  if (kind === "offline") pill.classList.add("offline");
  $("#statusPillText").textContent = text;
}

// ----------------------------------------------------------
// KPI cards (tickers + sparklines + deltas)
// ----------------------------------------------------------
function kpiCard(cfg) {
  return (
    '<div class="kpi accent-' + cfg.accent + '" role="group" aria-label="' + cfg.label + '">' +
    '<div class="kpi-head"><span class="kpi-label">' + cfg.label + "</span>" +
    '<span class="kpi-icon">' + icon(cfg.iconic, 18) + "</span></div>" +
    '<div class="kpi-value' + (cfg.mono ? " tabular" : "") + '"' + (cfg.id ? ' id="' + cfg.id + '"' : "") + ">" + (cfg.value != null ? cfg.value : "—") + "</div>" +
    '<div class="kpi-sub"><span class="kpi-sub-text">' + (cfg.sub || "") + "</span>" + (cfg.delta || "") + "</div>" +
    (cfg.spark != null ? '<div class="kpi-spark" data-spark="' + cfg.spark + '"></div>' : "") +
    "</div>"
  );
}

function renderKpis(result) {
  const d = result.data;
  const ctx = result.context || {};
  const unit = scopedUnit(d);
  const isAll = state.branch === "all";

  const sales = unit ? num(unit.sales) : num(d.kpis.sales);
  const tx = unit ? num(unit.transactions) : num(d.kpis.transactions);
  const customers = unit
    ? (unit.customers == null ? null : num(unit.customers))
    : (d.kpis.customers == null ? null : num(d.kpis.customers));
  const target = unit ? num(unit.target) : activeUnits(d).reduce((s, u) => s + num(u.target), 0);
  const achievement = target > 0 ? (sales / target) * 100 : 0;
  const remaining = Math.max(target - sales, 0);

  // Today + run-rate
  const todaySales = num(d.today && d.today.sales);
  const todayTx = num(d.today && d.today.transactions);
  const inProgress = isCurrentRealMonth();
  const dim = daysInMonth(state.year, state.month);
  const today = new Date();
  const daysElapsed = inProgress ? today.getDate() : dim;
  const daysRemaining = Math.max(dim - daysElapsed, 0);
  const requiredDaily = daysRemaining > 0 ? remaining / daysRemaining : 0;
  const pace = inProgress && target > 0 ? (target * daysElapsed) / dim : 0;

  // Deltas vs previous month (context merge)
  const prevSales = ctx.prev && !unit ? num(ctx.prev.kpis.sales) : null;
  const prevTx = ctx.prev && !unit ? num(ctx.prev.kpis.transactions) : null;
  const prevCustomers = ctx.prev && !unit && ctx.prev.kpis.customers != null ? num(ctx.prev.kpis.customers) : null;

  // 3-month sparkline window (real per-month figures only)
  const sparkWindow = () => {
    const rows = d.monthly || [];
    const m = state.month;
    if (m === 1) {
      const dec = ctx.prev && Array.isArray(ctx.prev.monthly) ? ctx.prev.monthly[11] : null;
      return [dec, rows[0]].filter(Boolean);
    }
    if (m === 2) return [rows[0], rows[1]].filter(Boolean);
    return [rows[m - 3], rows[m - 2], rows[m - 1]].filter(Boolean);
  };
  const sparkVals = (metric) => sparkWindow().map((r) => num(r[metric]));

  const cards = [
    {
      id: "kpiToday", label: t("kpi_today_sales"), value: data.fmtMoney(todaySales), mono: true, iconic: "bolt", accent: 0,
      sub: t("t_transactions", { n: data.fmtInt(todayTx) }),
    },
    {
      id: "kpiSales", label: t("kpi_month_sales"), value: data.fmtMoney(sales), mono: true, iconic: "money", accent: 1,
      sub: periodLabel(), delta: deltaChip(sales, prevSales), spark: "sales",
    },
    {
      label: t("kpi_target"), value: target > 0 ? data.fmtMoney(target) : "—", mono: true, iconic: "target", accent: 2,
      sub: inProgress && pace > 0 ? t("kpi_pace", { v: data.fmtMoney(Math.round(pace)) }) : (isAll ? t("all_branches") : branchName(unit) || ""),
    },
    {
      id: "kpiAch", label: t("kpi_achievement"), value: data.fmtPct(achievement), mono: true, iconic: "check", accent: 3,
      sub: achievement >= 100 && target > 0 ? t("t_target_reached") : t("t_target", { v: data.fmtMoney(remaining) }),
    },
    {
      label: t("kpi_remaining"), value: target > 0 ? data.fmtMoney(remaining) : "—", mono: true, iconic: "alert", accent: 4,
      sub: inProgress ? t("t_days_remaining", { n: daysRemaining }) : t("t_month_complete"),
    },
    {
      label: t("kpi_required"), value: inProgress && requiredDaily > 0 ? data.fmtMoney(requiredDaily) : "—", mono: true, iconic: "calendar", accent: 5,
      sub: inProgress ? t("t_days_remaining", { n: daysRemaining }) : t("t_month_complete"),
    },
    {
      id: "kpiTx", label: t("kpi_transactions"), value: data.fmtInt(tx), mono: true, iconic: "users", accent: 6,
      sub: periodLabel(), delta: deltaChip(tx, prevTx), spark: "tx",
    },
    {
      id: "kpiCust", label: t("kpi_customers"), value: customers == null ? "—" : data.fmtInt(customers), mono: true, iconic: "star", accent: 7,
      sub: periodLabel(), delta: customers != null ? deltaChip(customers, prevCustomers) : "", spark: "cust",
    },
  ];

  setHtmlIfChanged("kpiGrid", cards.map(kpiCard).join(""));

  // Sparklines (3-month mini-trend, real monthly figures)
  $$(".kpi-spark").forEach((el) => {
    if (el.dataset.spark === "sales") charts.sparkline(el, sparkVals("sales"));
    else if (el.dataset.spark === "tx") charts.sparkline(el, sparkVals("transactions"));
    else if (el.dataset.spark === "cust") charts.sparkline(el, []); // no per-month customer data
  });

  // Tickers — count up from the previously shown value (0 on
  // first paint). 800ms ease-out-quart, reduced-motion → instant.
  tickerFor("kpiToday", todaySales, (v) => data.fmtMoney(v));
  tickerFor("kpiSales", sales, (v) => data.fmtMoney(v));
  tickerFor("kpiAch", achievement, (v) => data.fmtPct(v));
  tickerFor("kpiTx", tx, (v) => data.fmtInt(v));
  if (customers != null) tickerFor("kpiCust", customers, (v) => data.fmtInt(v));
  else {
    const el = $("#kpiCust");
    if (el) el.textContent = "—";
  }
}

function tickerFor(id, value, format) {
  const el = document.getElementById(id);
  if (!el) return;
  const prev = kpiPrev.has(id) ? kpiPrev.get(id) : 0;
  if (prev === value) { el.textContent = format(value); return; }
  tick(el, bfcacheRestore ? value : prev, value, format, 800);
  kpiPrev.set(id, value);
}

// ----------------------------------------------------------
// Trend chart — period presets from the filters row:
//   Today / Last 15 Days / Last 1 Month / Month / Custom
// ----------------------------------------------------------
function mergedDaily(result) {
  const cur = (result.data && result.data.daily) || [];
  const prev = result.context && result.context.prev && Array.isArray(result.context.prev.daily)
    ? result.context.prev.daily
    : [];
  return prev.concat(cur).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function trendRowsFor(result) {
  const d = result.data;
  if (trendState.preset === "today") {
    const today = iso(new Date());
    const rows = mergedDaily(result).filter((r) => r.date === today);
    if (rows.length) return { rows, label: today };
    // Fallback: latest available day.
    const all = mergedDaily(result);
    const last = all.length ? all[all.length - 1].date : "—";
    return { rows: all.filter((r) => r.date === last), label: last };
  }
  if (trendState.preset === "15" || trendState.preset === "30") {
    const days = trendState.preset === "15" ? 15 : 30;
    const to = iso(new Date());
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - (days - 1));
    const from = iso(fromDate);
    const rows = mergedDaily(result).filter((r) => r.date >= from && r.date <= to);
    return { rows, label: from + " → " + to };
  }
  if (trendState.preset === "custom") {
    if (!trendState.from || !trendState.to) return { rows: [], label: "—" };
    const key = trendState.from + "→" + trendState.to;
    if (trendState.customKey === key && trendState.customRows) {
      return { rows: trendState.customRows, label: trendState.from + " → " + trendState.to };
    }
    return { rows: [], label: t("t_loading") };
  }
  return { rows: d.daily || [], label: periodLabel() };
}

function trendPoints(rows) {
  return (rows || []).map((r, i, arr) => {
    const prev = i > 0 ? arr[i - 1] : null;
    const delta = prev && prev.sales > 0 ? ((r.sales - prev.sales) / prev.sales) * 100 : null;
    const tip =
      '<div class="tt-row"><span>' + esc(r.date) + "</span></div>" +
      '<div class="tt-row"><span>' + t("kpi_month_sales") + "</span><b>" + data.fmtMoney(r.sales) + "</b></div>" +
      '<div class="tt-row"><span>' + t("kpi_transactions") + "</span><b>" + data.fmtInt(r.transactions) + "</b></div>" +
      (delta != null ? '<div class="tt-row"><span>' + t("t_vs_prev") + "</span><b>" + (delta >= 0 ? "▲ " : "▼ ") + Math.abs(delta).toFixed(1) + "%</b></div>" : "");
    return { v: r.sales, label: r.date ? r.date.slice(8, 10) : "", tip };
  });
}

function renderTrend(result) {
  const { rows, label } = trendRowsFor(result);
  const note = $("#trendNote");
  if (note) note.textContent = label;
  charts.lineChart($("#dailyChart"), {
    points: trendPoints(rows),
    fmtY: data.fmtKD,
    emptyText: t("t_no_daily"),
    animate: !bfcacheRestore,
  });
  const legend = $("#dailyLegend");
  if (legend) {
    const stats = data.rangeStats(rows, null, null);
    legend.innerHTML =
      '<span class="item"><span class="swatch" style="background:var(--brand-line)"></span>' +
      t("kpi_month_sales") + " · " + data.fmtMoney(stats.sales) + "</span>" +
      '<span class="item">' + icon("users", 14) + " " + data.fmtInt(stats.transactions) + " " + t("kpi_transactions") + "</span>";
  }
}

/** Fetch the custom range (parallel per-month merge) then redraw. */
async function applyTrendCustom(from, to) {
  trendState.preset = "custom";
  trendState.from = from;
  trendState.to = to;
  const key = from + "→" + to;
  trendState.customKey = key;
  trendState.customRows = null;
  if (state.lastResult) renderTrend(state.lastResult); // paints "Loading…"
  try {
    const rows = await data.getDailyRange(from, to);
    if (trendState.customKey !== key) return; // a newer range won
    trendState.customRows = rows;
  } catch (_) {
    if (trendState.customKey === key) trendState.customRows = [];
  }
  if (trendState.customKey === key && state.lastResult) renderTrend(state.lastResult);
}

function iso(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function syncChipActive(preset) {
  $$("#rangeFilter [data-preset]").forEach((c) =>
    c.classList.toggle("active", c.dataset.preset === preset)
  );
  const wrap = document.querySelector("#rangeFilter [data-custom-wrap]");
  if (wrap) wrap.hidden = preset !== "custom";
}

function wirePeriodChips() {
  const group = $("#rangeFilter");
  if (!group) return;
  group.querySelectorAll("[data-preset]").forEach((chip) => {
    chip.addEventListener("click", () => {
      const preset = chip.dataset.preset;
      syncChipActive(preset);
      if (preset === "custom") {
        const fromInput = group.querySelector('[data-range="from"]');
        const toInput = group.querySelector('[data-range="to"]');
        const to = new Date();
        const from = new Date(to);
        from.setDate(to.getDate() - 29);
        if (fromInput && !fromInput.value) fromInput.value = iso(from);
        if (toInput && !toInput.value) toInput.value = iso(to);
        if (fromInput && toInput && fromInput.value <= toInput.value) {
          applyTrendCustom(fromInput.value, toInput.value);
        }
      } else {
        trendState.preset = preset;
        if (state.lastResult) renderTrend(state.lastResult);
      }
    });
  });
  const applyBtn = group.querySelector('[data-apply]');
  if (applyBtn) {
    applyBtn.addEventListener("click", () => {
      const f = group.querySelector('[data-range="from"]');
      const to2 = group.querySelector('[data-range="to"]');
      if (f && to2 && f.value && to2.value && f.value <= to2.value) {
        applyTrendCustom(f.value, to2.value);
      }
    });
  }
}

// ----------------------------------------------------------
// Ranking + stacked revenue-mix bars
// ----------------------------------------------------------
function renderRanking(d) {
  const units = activeUnits(d).slice().sort((a, b) => num(b.sales) - num(a.sales));
  const wrap = $("#rankingList");
  if (!units.length) {
    setHtmlIfChanged("rankingList", '<div class="empty">' + t("t_no_data") + "</div>");
    return;
  }

  const maxSales = Math.max(1, ...units.map((u) => num(u.sales)));
  const html = units.map((u, i) => {
    const mix = data.unitRevenueMix(u, state.year, state.month);
    const mixTotal = num(u.sales);
    const segs = REVENUE_KEYS.map((k) => {
      const v = num(mix.sources[k]);
      const pct = mixTotal > 0 ? (v / mixTotal) * 100 : 0;
      return (
        '<span class="mix-seg" data-src="' + k + '" data-b="' + u.code + '" ' +
        'style="background:' + themes.colorForRevenue(k) + '" ' +
        'data-w="' + pct.toFixed(3) + '"></span>'
      );
    }).join("");

    const ach = num(u.achievement_pct);
    const achCls = ach >= 100 ? "good" : ach < 40 ? "bad" : ach < 80 ? "warn" : "neutral";
    const share = (mixTotal / maxSales) * 100;

    return (
      '<div class="ranking-row" data-branch="' + u.code + '" role="button" tabindex="0">' +
      '<div class="rr-top">' +
      '<span class="rank' + (i === 0 ? " top" : "") + '">#' + (i + 1) + "</span>" +
      '<span class="lb-dot big" aria-hidden="true" style="background:' + themes.branchAccent(u.code) + '"></span>' +
      '<div class="rr-name"><b>' + esc(branchName(u)) + "</b><small>" +
      t("t_transactions", { n: data.fmtInt(u.transactions) }) + " · " +
      t("t_target", { v: data.fmtMoney(u.target) }) + "</small></div>" +
      '<div class="rr-amt"><b class="tabular">' + data.fmtMoney(u.sales) + "</b>" +
      '<span class="ach-chip ' + achCls + '">' + data.fmtPct(ach) + "</span></div>" +
      "</div>" +
      '<div class="rr-progress" aria-hidden="true"><span class="' + achCls + '" style="width:' + share.toFixed(1) + '%"></span></div>' +
      '<div class="r-bar" aria-hidden="true">' + segs + "</div>" +
      "</div>"
    );
  }).join("");

  setHtmlIfChanged("rankingList", html);

  const note = $("#rankingNote");
  if (note) note.textContent = t("t_rank_label");

  const container = $("#rankingList");
  if (lastHtml.get("rankingList") === html) return;

  // Animate stacked-bar widths from 0 on mount (600ms, CSS).
  const reduce = charts.isReducedMotion() || bfcacheRestore;
  container.querySelectorAll(".mix-seg").forEach((seg) => {
    const w = seg.dataset.w;
    if (reduce) { seg.style.width = w + "%"; }
    else {
      seg.style.width = "0%";
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { seg.style.width = w + "%"; });
      });
    }
    seg.addEventListener("mousemove", (e) => {
      const k = seg.dataset.src;
      const u = (d.sales_units || []).find((x) => x.code === seg.dataset.b);
      const mix = data.unitRevenueMix(u, state.year, state.month);
      const v = num(mix.sources[k]);
      const pct = num(u && u.sales) > 0 ? (v / num(u.sales)) * 100 : 0;
      charts.showTooltip(
        '<div class="tt-row"><span>' + esc(i18n.revLabel(k)) + "</span></div>" +
        '<div class="tt-row"><span>' + data.fmtMoney(v) + "</span><b>" + pct.toFixed(1) + "%</b></div>",
        e.clientX, e.clientY
      );
    });
    seg.addEventListener("mouseleave", charts.hideTooltip);
  });

  container.querySelectorAll(".ranking-row").forEach((row) => {
    row.addEventListener("click", () => selectBranch(row.dataset.branch));
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); selectBranch(row.dataset.branch); }
    });
  });
}

// ----------------------------------------------------------
// Revenue breakdown (donut + ranked list + tooltips)
// ----------------------------------------------------------
function revenueTipItems(d, ctx) {
  const src = (d.revenue && d.revenue.sources) || {};
  const prevSrc = ctx && ctx.prev && ctx.prev.revenue ? ctx.prev.revenue.sources || {} : null;
  const total = REVENUE_KEYS.reduce((s, k) => s + num(src[k]), 0);
  return REVENUE_KEYS.map((k) => {
    const v = num(src[k]);
    const pct = total > 0 ? (v / total) * 100 : 0;
    const prevV = prevSrc ? num(prevSrc[k]) : null;
    const delta = prevV != null && prevV > 0 ? ((v - prevV) / prevV) * 100 : null;
    return { key: k, value: v, pct, delta };
  });
}

function renderRevenue(result) {
  const d = result.data;
  const items = revenueTipItems(d, result.context);
  const total = items.reduce((s, x) => s + x.value, 0);
  const note = $("#revenueNote");
  if (note) note.textContent = periodLabel();

  // Donut
  const donutItems = items
    .filter((x) => x.value > 0)
    .map((x) => ({
      key: x.key,
      value: x.value,
      color: themes.colorForRevenue(x.key),
      tip:
        '<div class="tt-row"><span>' + esc(i18n.revLabel(x.key)) + "</span></div>" +
        '<div class="tt-row"><span>' + data.fmtMoney(x.value) + "</span><b>" + x.pct.toFixed(1) + "%</b></div>" +
        (x.delta != null ? '<div class="tt-row"><span>' + t("t_vs_prev") + "</span><b>" + (x.delta >= 0 ? "▲ " : "▼ ") + Math.abs(x.delta).toFixed(1) + "%</b></div>" : ""),
    }));
  charts.donutChart($("#donutMount"), {
    items: donutItems,
    centerSales: data.fmtMoney(total),
    centerTx: t("kpi_transactions") + " " + data.fmtInt(num(d.kpis.transactions)),
    emptyText: t("t_no_revenue"),
    ariaLabel: t("sec_revenue"),
  });

  // Ranked list (all 5 sources, even zero)
  const maxV = Math.max(1, ...items.map((x) => x.value));
  const rows = items
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((x) =>
      '<li class="rev-row">' +
      '<span class="lb-dot" style="background:' + themes.colorForRevenue(x.key) + '"></span>' +
      '<span class="rev-name">' + esc(i18n.revLabel(x.key)) + "</span>" +
      '<span class="rev-bar"><span style="width:' + ((x.value / maxV) * 100).toFixed(1) + '%;background:' + themes.colorForRevenue(x.key) + '"></span></span>' +
      '<span class="rev-val tabular">' + data.fmtMoney(x.value) + "</span>" +
      '<span class="rev-pct tabular">' + x.pct.toFixed(1) + "%</span>" +
      "</li>"
    ).join("");
  const totalRow =
    '<li class="rev-row total">' +
    '<span class="rev-name"><b>' + t("t_ann_total") + "</b></span>" +
    '<span class="rev-val tabular"><b>' + data.fmtMoney(total) + "</b></span>" +
    '<span class="rev-pct tabular"><b>100%</b></span></li>';

  setHtmlIfChanged("revList", '<ul class="rev-rows">' + rows + totalRow + "</ul>");

  const partial = $("#revenuePartial");
  if (partial) {
    const show = !!(d.revenue && d.revenue.partial);
    partial.hidden = !show;
    if (show) partial.innerHTML = icon("alert", 14) + " " + t("t_revenue_partial");
  }

  // Empty state (only when there is nothing to chart at all)
  const emptyEl = $("#revenueEmpty");
  if (emptyEl) {
    const isEmpty = total <= 0;
    emptyEl.hidden = !isEmpty;
    if (isEmpty) emptyEl.textContent = t("t_no_revenue");
  }
}

// ----------------------------------------------------------
// Monthly bars + annual report
// ----------------------------------------------------------
function renderMonthly(d) {
  const rows = (d.monthly || []).map((r, i) => {
    const isCur = i === state.month - 1;
    const pace = isCur && isCurrentRealMonth() && r.target > 0
      ? (r.target * new Date().getDate()) / daysInMonth(state.year, state.month)
      : null;
    return {
      label: MONTHS_SHORT[i],
      actual: num(r.sales),
      target: num(r.target),
      pace,
      tip:
        '<div class="tt-row"><span>' + i18n.monthName(i + 1) + "</span></div>" +
        '<div class="tt-row"><span>' + t("t_ann_actual") + "</span><b>" + data.fmtMoney(r.sales) + "</b></div>" +
        '<div class="tt-row"><span>' + t("t_ann_target") + "</span><b>" + data.fmtMoney(r.target) + "</b></div>" +
        (pace != null
          ? '<div class="tt-row"><span>' + t("kpi_pace", { v: data.fmtMoney(Math.round(pace)) }) + "</span></div>"
          : ""),
    };
  });
  charts.barsChart($("#monthlyChart"), {
    rows,
    fmtY: data.fmtKD,
    emptyText: t("t_no_data"),
  });
  const note = $("#monthlyNote");
  if (note) note.textContent = String(state.year);
  const legend = $("#monthlyLegend");
  if (legend) {
    legend.innerHTML =
      '<span class="item"><span class="swatch" style="background:var(--brand-line)"></span>' + t("t_legend_actual") + "</span>" +
      '<span class="item"><span class="swatch target"></span>' + t("t_legend_target") + "</span>";
  }
}

function annualRowClass(pct, target) {
  if (target <= 0) return "";
  if (pct >= 100) return "good"; // hit or exceed
  if (pct < 40) return "bad";
  if (pct < 80) return "warn";
  return ""; // 80–99.99% → neutral
}

function renderAnnual(d) {
  const rows = d.monthly || [];
  const body = rows.map((r, i) => {
    const actual = num(r.sales);
    const target = num(r.target);
    const pct = target > 0 ? (actual / target) * 100 : 0;
    const remaining = Math.max(target - actual, 0);
    const cls = annualRowClass(pct, target);
    const barW = Math.min(pct, 100);
    return (
      "<tr>" +
      '<td class="sticky-col">' + i18n.monthName(i + 1) + "</td>" +
      '<td class="right tabular">' + data.fmtMoney(actual) + "</td>" +
      '<td class="right tabular">' + (target > 0 ? data.fmtMoney(target) : '<span class="muted">—</span>') + "</td>" +
      '<td class="right"><div class="ach-cell"><span class="tabular ' + cls + '">' + (target > 0 ? data.fmtPct(pct) : "—") + "</span>" +
      '<span class="pbar' + (cls ? " " + cls : "") + '"><i style="width:' + barW.toFixed(1) + '%"></i></span></div></td>' +
      '<td class="right tabular">' + (target > 0 ? data.fmtMoney(remaining) : '<span class="muted">—</span>') + "</td>" +
      "</tr>"
    );
  }).join("");

  const totActual = rows.reduce((s, r) => s + num(r.sales), 0);
  const totTarget = rows.reduce((s, r) => s + num(r.target), 0);
  const totPct = totTarget > 0 ? (totActual / totTarget) * 100 : 0;
  const totCls = annualRowClass(totPct, totTarget);
  const totalRow =
    "<tr>" +
    '<td class="sticky-col"><b>' + t("t_ann_total") + "</b></td>" +
    '<td class="right tabular"><b>' + data.fmtMoney(totActual) + "</b></td>" +
    '<td class="right tabular"><b>' + data.fmtMoney(totTarget) + "</b></td>" +
    '<td class="right"><div class="ach-cell"><span class="tabular ' + totCls + '"><b>' + data.fmtPct(totPct) + "</b></span>" +
    '<span class="pbar' + (totCls ? " " + totCls : "") + '"><i style="width:' + Math.min(totPct, 100).toFixed(1) + '%"></i></span></div></td>' +
    '<td class="right tabular"><b>' + data.fmtMoney(Math.max(totTarget - totActual, 0)) + "</b></td>" +
    "</tr>";

  setHtmlIfChanged("annualTbody", body + totalRow);
  const note = $("#annualNote");
  if (note) note.textContent = String(state.year);
  const title = $("#annualTitle");
  if (title) title.textContent = annualTitle();
}

// ----------------------------------------------------------
// Unit cards
// ----------------------------------------------------------
function renderUnits(d) {
  const units = d.sales_units || [];
  const note = $("#unitNote");
  if (note) {
    note.textContent = t("t_units", { n: units.filter((u) => !u.is_pending).length });
  }
  const html = units.map((u) => {
    const ach = num(u.achievement_pct);
    const cls = u.is_pending ? "" : annualRowClass(ach, num(u.target));
    return (
      '<div class="unit' + (u.is_pending ? " pending" : "") + '" data-code="' + u.code + '">' +
      '<div class="unit-head"><span class="unit-name">' + esc(branchName(u)) +
      (u.is_pending ? ' <span class="pend-badge">' + t("pending_badge") + "</span>" : "") + "</span>" +
      '<span class="unit-status' + (u.status !== "online" ? " off" : "") + '">' + esc(u.status) + "</span></div>" +
      '<div class="unit-sales tabular">' + (u.is_pending ? "—" : data.fmtMoney(u.sales)) + "</div>" +
      '<div class="bar"><span class="' + cls + '" style="width:' + Math.min(ach, 100).toFixed(1) + '%"></span></div>' +
      '<div class="unit-meta"><span>' + t("t_target", { v: u.is_pending || num(u.target) > 0 ? data.fmtMoney(u.target) : "—" }) + "</span>" +
      '<span class="tabular ' + cls + '">' + (u.is_pending || num(u.target) > 0 ? data.fmtPct(ach) : "—") + "</span></div>" +
      '<div class="unit-meta"><span>' + t("t_transactions", { n: data.fmtInt(u.transactions) }) + "</span>" +
      "<span>" + (u.customers == null ? "—" : t("t_customers", { n: data.fmtInt(u.customers) })) + "</span></div>" +
      "</div>"
    );
  }).join("");
  setHtmlIfChanged("unitsGrid", html);
  const pnote = $("#pendingNote");
  if (pnote) pnote.textContent = pendingUnits(d).length ? t("pending_note") : "";
}

// ----------------------------------------------------------
// Confetti micro-celebration (once per branch per session)
// ----------------------------------------------------------
function checkCelebrations(d) {
  if (charts.isReducedMotion() || bfcacheRestore) return;
  activeUnits(d).forEach((u) => {
    if (num(u.achievement_pct) >= 100 && !celebrated.has(u.code)) {
      celebrated.add(u.code);
      const card = document.querySelector('.unit[data-code="' + u.code + '"]');
      if (card) {
        const r = card.getBoundingClientRect();
        burstAt(r.left + r.width / 2, r.top + 24, [
          themes.branchAccent(u.code),
          themes.colorForRevenue("RECEIPT"),
          themes.colorForRevenue("PERSONAL"),
          "#C9A24B",
        ]);
      }
    }
  });
}

// ----------------------------------------------------------
// Master render
// ----------------------------------------------------------
let firstRenderDone = false;
let renderChain = 0;

function renderAll(result) {
  state.lastResult = result;
  state.lastData = result.data;

  // Above the fold first: period label, KPI cards, trend chart.
  $("#periodLabel").textContent = periodLabel();
  renderKpis(result);
  renderTrend(result);

  // Subsequent full renders (refresh, language switch, theme,
  // bfcache restore) stay synchronous; only the very first
  // paint is chunked.
  if (firstRenderDone) {
    renderChain++; // cancel any still-pending first-paint chunks
    renderRanking(result.data);
    renderRevenue(result);
    renderMonthly(result.data);
    renderAnnual(result.data);
    renderUnits(result.data);
    checkCelebrations(result.data);
    return;
  }

  firstRenderDone = true;
  const myChain = ++renderChain;
  const tasks = [
    () => renderRanking(result.data),
    () => renderRevenue(result),
    () => renderMonthly(result.data),
    () => renderAnnual(result.data),
    () => renderUnits(result.data),
    () => checkCelebrations(result.data),
  ];
  let i = 0;
  const step = () => {
    if (renderChain !== myChain) return; // superseded by a newer full render
    const fn = tasks[i++];
    fn();
    if (i < tasks.length) schedule();
  };
  // One section per task. rAF normally; a setTimeout fallback
  // keeps the chain alive when rAF is throttled or paused.
  const schedule = () => {
    let ran = false;
    const run = () => { if (ran) return; ran = true; step(); };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    setTimeout(run, 32);
  };
  schedule();
}

function rerenderFromCache() {
  if (state.lastResult) renderAll(state.lastResult);
  else charts.redrawAll();
}

// ----------------------------------------------------------
// Branch selection
// ----------------------------------------------------------
function selectBranch(code) {
  if (!code) return;
  state.branch = code;
  branchLb.setValue(code, true);
  themes.applyBranchTheme(code);
  document.title = (code === "all" ? t("all_branches") : branchLabelFor(code)) + " · " + t("app_title");
  rerenderFromCache();
}

function branchLabelFor(code) {
  const b = themes.getBranch(code);
  return i18n.getLang() === "ar" ? b.name_ar : b.name_en;
}

// ----------------------------------------------------------
// Data loading
// ----------------------------------------------------------
let loading = false;

async function load() {
  if (loading) return;
  loading = true;
  setStatus("syncing", t("status_syncing"));
  const spin = $("#refreshBtn svg");
  if (spin) spin.classList.add("spin");

  try {
    const result = await data.getDashboard(state.year, state.month, {
      force: false,
      onPartial: (key, val) => {
        // Streaming paint: show the headline numbers as soon as
        // the kpis object has fully arrived.
        if (key === "kpis" && val && state.branch === "all") {
          const el = document.getElementById("kpiSales");
          if (el && lastHtml.has("kpiGrid")) {
            el.textContent = data.fmtMoney(num(val.sales));
          }
        }
      },
    });
    renderAll(result);
    data.idlePrefetch(state.year, state.month);

    const health = await data.getHealth();
    if (health.ok) setStatus("online", t("status_online"));
    else setStatus("offline", t("status_offline"));
  } catch (err) {
    // Only reachable if even the demo payload failed to build.
    setStatus("offline", t("status_offline"));
    setHtmlIfChanged("errorSlot",
      '<div class="error-box">' + icon("alert", 18) + " " + t("t_offline_msg") +
      ' <button type="button" data-retry="1">' + t("action_retry") + "</button></div>");
    const btn = document.querySelector("#errorSlot [data-retry]");
    if (btn) btn.addEventListener("click", load);
  } finally {
    loading = false;
    const spin2 = $("#refreshBtn svg");
    if (spin2) spin2.classList.remove("spin");
  }
}

// ----------------------------------------------------------
// Filters / navigation
// ----------------------------------------------------------
function buildBranchListbox() {
  const btn = $("#branchListbox");
  if (!btn) return;
  const options = [
    {
      value: "all",
      label: t("all_branches"),
      dot: themes.branchAccent("all"),
      badge: "",
    },
  ].concat(
    themes.BRANCHES.map((b) => ({
      value: b.code,
      label: i18n.getLang() === "ar" ? b.name_ar : b.name_en,
      dot: themes.branchAccent(b.code),
      badge: b.pending ? t("pending_badge") : "",
    }))
  );
  branchLb = createListbox(btn, {
    options,
    value: "all",
    placeholder: t("filter_branch"),
    onAriaLabel: (sel) => t("filter_branch") + ": " + (sel ? sel.label : ""),
    onChange: (v) => selectBranch(v),
  });
}

// ----------------------------------------------------------
// Header controls + keyboard
// ----------------------------------------------------------
function wireHeader() {
  const themeBtn = $("#theme-toggle");
  if (themeBtn) {
    themeBtn.addEventListener("click", () => {
      themes.toggleColorMode();
      syncThemeButton();
      themes.applyBranchTheme(state.branch);
      rerenderFromCache();
    });
  }
  const langBtn = $("#langToggle");
  if (langBtn) {
    langBtn.addEventListener("click", () => {
      i18n.setLang(i18n.getLang() === "en" ? "ar" : "en");
    });
  }
  const refreshBtn = $("#refreshBtn");
  if (refreshBtn) refreshBtn.addEventListener("click", () => load());
}

function syncThemeButton() {
  const btn = $("#theme-toggle");
  if (!btn) return;
  const ic = btn.querySelector("[data-icon]");
  if (!ic) return;
  ic.dataset.icon = themes.getColorMode() === "dark" ? "sun" : "moon";
  ic.innerHTML = icon(ic.dataset.icon, 18);
  btn.setAttribute("aria-label", t("theme_toggle_label") + " (" + (themes.getColorMode() === "dark" ? "dark" : "light") + ")");
}

function wireShortcuts() {
  document.addEventListener("keydown", (e) => {
    const tag = e.target && e.target.tagName;
    if (/input|textarea|select/i.test(tag || "")) return;
    if (e.target && e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "r") { e.preventDefault(); load(); }
    else if (k === "b") { e.preventDefault(); if (branchLb) { branchLb.toggle(); branchLb.focus(); } }
    else if (k === "t") { e.preventDefault(); const b = $("#theme-toggle"); if (b) b.click(); }
    else if (k === "l") { e.preventDefault(); const b = $("#langToggle"); if (b) b.click(); }
  });
}

function wireLanguageChange() {
  i18n.onChange(() => {
    // Re-translate static nodes.
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    const langBtnText = $("#langToggleText");
    if (langBtnText) langBtnText.textContent = t("lang_switch_label");
    // Rebuild dynamic option labels.
    if (branchLb) {
      branchLb.setOptions(
        [{ value: "all", label: t("all_branches"), dot: themes.branchAccent("all"), badge: "" }].concat(
          themes.BRANCHES.map((b) => ({
            value: b.code,
            label: i18n.getLang() === "ar" ? b.name_ar : b.name_en,
            dot: themes.branchAccent(b.code),
            badge: b.pending ? t("pending_badge") : "",
          }))
        ),
        true
      );
    }
    syncThemeButton();
    if (state.lastResult) renderAll(state.lastResult);
    else charts.redrawAll();
  });
}

// ----------------------------------------------------------
// Auto-refresh — deliberately slow: 5 minutes, and a
// visibility return only revalidates when the data is
// actually stale. No aggressive background syncing.
// ----------------------------------------------------------
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

function wireAutoRefresh() {
  setInterval(() => {
    if (document.hidden) return;
    load();
  }, SYNC_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const age = state.lastResult ? Date.now() - state.lastResult.ts : Infinity;
    if (age >= SYNC_INTERVAL_MS) load(); // only if stale
  }, { passive: true });
  // Back/forward cache restore: skip entry animations once.
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      bfcacheRestore = true;
      charts.setSkipAnimationsOnce();
      if (state.lastResult) renderAll(state.lastResult);
      // Next load animates normally again.
      setTimeout(() => { bfcacheRestore = false; }, 600);
    }
  }, { passive: true });
}

// ----------------------------------------------------------
// Lazy chart registration
// ----------------------------------------------------------
function registerCharts() {
  const daily = $("#dailyChart");
  if (daily) charts.lazyDraw(daily, () => state.lastResult && renderTrend(state.lastResult));
  const monthly = $("#monthlyChart");
  if (monthly) charts.lazyDraw(monthly, () => state.lastData && renderMonthly(state.lastData));
}

// ----------------------------------------------------------
// Boot
// ----------------------------------------------------------
function boot() {
  themes.initThemes();
  i18n.initLang();
  themes.applyBranchTheme("all");
  hydrateIcons();

  initSidebar({});
  buildBranchListbox();
  wirePeriodChips();
  wireHeader();
  syncThemeButton();
  wireLanguageChange();
  wireShortcuts();
  wireAutoRefresh();
  registerCharts();

  const langBtnText = $("#langToggleText");
  if (langBtnText) langBtnText.textContent = t("lang_switch_label");

  load();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
