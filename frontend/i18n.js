/* =============================================================
   i18n.js  (v3)
   English + natural Modern Standard Arabic. Western digits are
   always used — numbers are formatted in JS with en-US locale
   before they ever reach a string. Includes a minimal ICU-style
   plural parser: "{n, plural, one {…} other {…}}" with full
   Arabic plural categories (zero/one/two/few/many/other).
   ============================================================= */

"use strict";

const STRINGS = {
  en: {
    app_title: "Central Sales Dashboard",
    app_subtitle: "Force Holding Co",
    brand_name: "Force Holding Co",
    nav_overview: "Overview",
    nav_performance: "Performance",
    nav_ranking: "Branch Ranking",
    nav_sources: "Revenue Sources",
    nav_annual: "2026 Annual Report",
    nav_branches: "Branches",
    filter_branch: "Branch",
    filter_period: "Period",
    filter_preset_today: "Today",
    filter_preset_15: "Last 15 Days",
    filter_preset_30: "Last 1 Month",
    filter_preset_month: "Month",
    filter_preset_custom: "Custom",
    filter_from: "From",
    filter_to: "To",
    action_refresh: "Refresh",
    action_retry: "Retry",
    action_close: "Close",
    action_apply: "Apply",
    lang_switch_label: "العربية",
    theme_toggle_label: "Toggle theme",
    month_prev_label: "Previous month",
    month_next_label: "Next month",
    pick_month_label: "Pick a month",
    status_online: "Online",
    status_syncing: "Syncing…",
    status_offline: "Offline",
    status_demo: "Demo data",
    kpi_today_sales: "Today's Sales",
    kpi_month_sales: "Month Sales",
    kpi_target: "Monthly Target",
    kpi_achievement: "Achievement",
    kpi_remaining: "Remaining",
    kpi_required: "Required Daily",
    kpi_transactions: "Transactions",
    kpi_customers: "Customers",
    kpi_pace: "Pace {v} (prorated)",
    sec_daily_trend: "Revenue Trend",
    sec_monthly_compare: "Monthly Sales vs Target",
    sec_units: "Sales Unit Performance",
    sec_revenue: "Revenue Source Breakdown",
    sec_ranking: "Branch Performance & Ranking",
    sec_annual: "2026 Annual Performance Report",
    sec_heatmap: "Daily Sales Calendar",
    rev_RECEIPT: "Memberships",
    rev_DAILY: "Daily passes",
    rev_LOCKERS: "Lockers",
    rev_PERSONAL: "Personal training",
    rev_PROTEIN: "Cafeteria",
    trend_mode_daily: "Daily",
    trend_mode_last: "Last Month",
    trend_mode_custom: "Custom",
    all_branches: "All Branches",
    pending_badge: "(pending)",
    pending_note: "Pending branches are shown for visibility but are not included in totals, rankings, targets, or the annual report.",
    t_transactions: "{n, plural, one {# transaction} other {# transactions}}",
    t_customers: "{n, plural, one {# customer} other {# customers}}",
    t_units: "{n, plural, one {# sales unit} other {# sales units}}",
    t_days_remaining: "{n, plural, one {# day remaining} other {# days remaining}}",
    t_month_complete: "Month complete",
    t_target: "Target {v}",
    t_target_reached: "Target reached",
    t_rank_label: "Ranked by revenue",
    t_mix_label: "Revenue mix (estimated)",
    t_ann_month: "Month",
    t_ann_actual: "Actual",
    t_ann_target: "Target",
    t_ann_achievement: "Achievement",
    t_ann_remaining: "Remaining",
    t_ann_total: "Total",
    t_ann_progress: "Progress",
    t_revenue_partial: "Revenue breakdown is partial — some sales units do not report source-level data yet.",
    t_no_revenue: "No revenue source data for this period.",
    t_no_daily: "No daily data for this period.",
    t_no_data: "No data",
    t_loading: "Loading…",
    t_offline_msg: "Demo data is unavailable.",
    t_demo_note: "Showing deterministic demo data.",
    t_vs_prev: "vs previous month",
    t_delta_up: "▲ {v}",
    t_delta_down: "▼ {v}",
    t_heat_pick: "Select a day to see its details",
    t_day_details: "Day details",
    t_legend_actual: "Actual",
    t_legend_target: "Target",
    t_pct_of_total: "{p} of total",
    t_period_all: "All days",
    t_showing_range: "{a} → {b}",
    t_listbox_hint: "Use arrow keys to navigate",
  },

  ar: {
    app_title: "لوحة مبيعات المبيعات المركزية",
    app_subtitle: "فورس القابضة",
    brand_name: "فورس القابضة",
    nav_overview: "نظرة عامة",
    nav_performance: "الأداء",
    nav_ranking: "ترتيب الفروع",
    nav_sources: "مصادر الإيراد",
    nav_annual: "تقرير عام 2026",
    nav_branches: "الفروع",
    filter_branch: "الفرع",
    filter_period: "الفترة",
    filter_preset_today: "اليوم",
    filter_preset_15: "آخر 15 يوماً",
    filter_preset_30: "آخر شهر",
    filter_preset_month: "الشهر",
    filter_preset_custom: "مخصص",
    filter_from: "من",
    filter_to: "إلى",
    action_refresh: "تحديث",
    action_retry: "إعادة المحاولة",
    action_close: "إغلاق",
    action_apply: "تطبيق",
    lang_switch_label: "English",
    theme_toggle_label: "تبديل المظهر",
    month_prev_label: "الشهر السابق",
    month_next_label: "الشهر التالي",
    pick_month_label: "اختر الشهر",
    status_online: "متصل",
    status_syncing: "تتم المزامنة…",
    status_offline: "غير متصل",
    status_demo: "بيانات تجريبية",
    kpi_today_sales: "مبيعات اليوم",
    kpi_month_sales: "مبيعات الشهر",
    kpi_target: "هدف الشهر",
    kpi_achievement: "نسبة الإنجاز",
    kpi_remaining: "المتبقي",
    kpi_required: "المطلوب يومياً",
    kpi_transactions: "المعاملات",
    kpi_customers: "العملاء",
    kpi_pace: "الوتيرة {v} (تناسبية)",
    sec_daily_trend: "اتجاه الإيراد",
    sec_monthly_compare: "المبيعات الشهرية مقابل الهدف",
    sec_units: "أداء وحدات البيع",
    sec_revenue: "تفصيل مصادر الإيراد",
    sec_ranking: "أداء الفروع وترتيبها",
    sec_annual: "تقرير الأداء السنوي 2026",
    sec_heatmap: "تقويم المبيعات اليومية",
    rev_RECEIPT: "العضويات",
    rev_DAILY: "التذاكر اليومية",
    rev_LOCKERS: "الخزائن",
    rev_PERSONAL: "التدريب الشخصي",
    rev_PROTEIN: "الكافيتيريا",
    trend_mode_daily: "اليومي",
    trend_mode_last: "الشهر الماضي",
    trend_mode_custom: "مخصص",
    all_branches: "جميع الفروع",
    pending_badge: "(قيد الانتظار)",
    pending_note: "تُعرض الفروع قيد الانتظار للاطلاع فقط، ولا تُحتسب في المجاميع ولا في الترتيب ولا في الأهداف ولا في التقرير السنوي.",
    t_transactions: "{n, plural, zero {لا معاملات} one {معاملة واحدة} two {معاملتان} few {# معاملات} many {# معاملة} other {# معاملة}}",
    t_customers: "{n, plural, zero {لا عملاء} one {عميل واحد} two {عميلان} few {# عملاء} many {# عميلاً} other {# عميل}}",
    t_units: "{n, plural, zero {لا وحدات بيع} one {وحدة بيع واحدة} two {وحدتا بيع} few {# وحدات بيع} many {# وحدة بيع} other {# وحدة بيع}}",
    t_days_remaining: "{n, plural, zero {لا أيام متبقية} one {يوم واحد متبقٍ} two {يومان متبقيان} few {# أيام متبقية} many {# يوماً متبقياً} other {# يوم متبقٍ}}",
    t_month_complete: "اكتمل الشهر",
    t_target: "الهدف {v}",
    t_target_reached: "تم تحقيق الهدف",
    t_rank_label: "الترتيب حسب الإيراد",
    t_mix_label: "توزيع مصادر الإيراد (تقديري)",
    t_ann_month: "الشهر",
    t_ann_actual: "الفعلي",
    t_ann_target: "الهدف",
    t_ann_achievement: "نسبة الإنجاز",
    t_ann_remaining: "المتبقي",
    t_ann_total: "الإجمالي",
    t_ann_progress: "التقدم",
    t_revenue_partial: "تفصيل مصادر الإيراد جزئي — بعض وحدات البيع لا تقدم بيانات على مستوى المصدر بعد.",
    t_no_revenue: "لا توجد بيانات لمصادر الإيراد لهذه الفترة.",
    t_no_daily: "لا توجد بيانات يومية لهذه الفترة.",
    t_no_data: "لا توجد بيانات",
    t_loading: "جارٍ التحميل…",
    t_offline_msg: "البيانات التجريبية غير متاحة.",
    t_demo_note: "تُعرض بيانات تجريبية ثابتة.",
    t_vs_prev: "مقارنة بالشهر السابق",
    t_delta_up: "▲ {v}",
    t_delta_down: "▼ {v}",
    t_heat_pick: "اختر يوماً لعرض تفاصيله",
    t_day_details: "تفاصيل اليوم",
    t_legend_actual: "الفعلي",
    t_legend_target: "الهدف",
    t_pct_of_total: "{p} من الإجمالي",
    t_period_all: "جميع الأيام",
    t_showing_range: "{a} → {b}",
    t_listbox_hint: "استخدم مفاتيح الأسهم للتنقل",
  },
};

let current = "en";
const subs = new Set();

// ----------------------------------------------------------
// ICU-style plural categories
// en: one | other      ar: zero|one|two|few|many|other
// ----------------------------------------------------------
function pluralCategory(n, lang) {
  n = Math.abs(Math.trunc(Number(n) || 0));
  if (lang === "ar") {
    if (n === 0) return "zero";
    if (n === 1) return "one";
    if (n === 2) return "two";
    const mod100 = n % 100;
    if (mod100 >= 3 && mod100 <= 10) return "few";
    if (mod100 >= 11 && mod100 <= 99) return "many";
    return "other";
  }
  return n === 1 ? "one" : "other";
}

/**
 * Expand a "{n, plural, one {…} other {…}}" clause. `#` inside a
 * branch is replaced with the (western-digit) number.
 */
function expandPlural(clause, n, lang) {
  const re = /(zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  const branches = {};
  let m;
  while ((m = re.exec(clause)) !== null) branches[m[1]] = m[2];
  let cat = pluralCategory(n, lang);
  if (!(cat in branches)) cat = "other" in branches ? "other" : cat;
  const chosen = branches[cat] != null ? branches[cat] : String(n);
  return chosen.replace(/#/g, String(n));
}

/** Simple {var} interpolation over a string. */
function interpolate(str, vars) {
  return str.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole
  );
}

export function t(key, vars) {
  const dict = STRINGS[current] || STRINGS.en;
  let s = dict[key];
  if (s == null) s = STRINGS.en[key] != null ? STRINGS.en[key] : key;
  if (vars) {
    // Plural clauses first, then plain interpolation.
    s = s.replace(/\{(\w+),\s*plural,\s*((?:[^{}]|\{[^{}]*\})*)\}/g, (whole, name, clause) => {
      if (!Object.prototype.hasOwnProperty.call(vars, name)) return whole;
      return expandPlural(clause, vars[name], current);
    });
    s = interpolate(s, vars);
  }
  return s;
}

export function getLang() {
  return current;
}

export function isRTL() {
  return current === "ar";
}

export function setLang(lang) {
  if (lang !== "en" && lang !== "ar") lang = "en";
  if (lang === current) return;
  current = lang;
  const root = document.documentElement;
  root.setAttribute("lang", lang);
  root.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
  try { localStorage.setItem("ich.lang", lang); } catch (_) { /* ignore */ }
  subs.forEach((fn) => { try { fn(lang); } catch (_) { /* ignore */ } });
}

export function onChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

export function initLang() {
  let saved = "en";
  try { saved = localStorage.getItem("ich.lang") || "en"; } catch (_) { /* ignore */ }
  current = saved === "ar" ? "ar" : "en";
  const root = document.documentElement;
  root.setAttribute("lang", current);
  root.setAttribute("dir", current === "ar" ? "rtl" : "ltr");
}

/**
 * Revenue source label for the exact UPPERCASE key. Unknown keys
 * get a humanized fallback (Title Case of the key) in both
 * languages — never a raw underscore token.
 */
export function revLabel(key) {
  const dict = STRINGS[current] || STRINGS.en;
  if (Object.prototype.hasOwnProperty.call(dict, "rev_" + key)) {
    return dict["rev_" + key];
  }
  return humanizeKey(key);
}

function humanizeKey(key) {
  const s = String(key || "").replace(/[_-]+/g, " ").trim();
  if (!s) return "—";
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const MONTHS_AR = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

export function monthName(index1to12) {
  const i = ((Number(index1to12) || 1) - 1 + 12) % 12;
  return (current === "ar" ? MONTHS_AR : MONTHS_EN)[i];
}