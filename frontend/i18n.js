/* =============================================================
   i18n.js
   English + Arabic dictionaries and a tiny reactive translation
   helper. App is English by default; the header toggles to AR and
   the document flips to RTL.
   ============================================================= */

(function (global) {
  "use strict";

  const STRINGS = {
    en: {
      app_title: "ICH — All Branches Sales Dashboard",
      app_subtitle: "Force Holding Co",
      nav_overview: "Overview",
      nav_performance: "Performance",
      nav_sources: "Revenue Sources",
      nav_ranking: "Branch Ranking",
      nav_annual: "2026 Annual Report",
      nav_settings: "Settings",
      nav_branches: "Branches",
      filter_period: "Period",
      filter_branch: "Branch",
      filter_preset_today: "Today",
      filter_preset_15: "Last 15 Days",
      filter_preset_30: "Last 1 Month",
      filter_preset_custom: "Custom",
      filter_from: "From",
      filter_to: "To",
      action_refresh: "Refresh",
      action_retry: "Retry",
      lang_label: "العربية",
      status_online: "Online",
      status_syncing: "Syncing…",
      status_offline: "Offline",
      status_last_sync: "Last synced",
      kpi_today_sales: "Today's Sales",
      kpi_month_sales: "Selected Period Sales",
      kpi_target: "Monthly Target",
      kpi_achievement: "Achievement",
      kpi_remaining: "Remaining Target",
      kpi_required: "Required Daily",
      kpi_transactions: "Transactions",
      kpi_avg: "Average Transaction",
      sec_daily_trend: "Revenue Trend",
      sec_monthly_compare: "Monthly Sales vs Target",
      sec_units: "Sales Unit Performance",
      sec_revenue: "Revenue Source Breakdown",
      sec_ranking: "Branch Performance & Ranking",
      sec_annual: "2026 Annual Performance Report",
      rev_membership: "Membership",
      rev_daily: "Daily Pass",
      rev_personal: "Personal Training",
      rev_cafeteria: "Cafeteria",
      all_branches: "All Branches",
      t_transactions: "{n} transactions",
      t_target: "Target {v}",
      t_achievement: "{p} of target",
      t_remaining: "Balance to target",
      t_target_reached: "Target reached",
      t_days_remaining: "{n} days remaining",
      t_month_complete: "Period complete",
      t_avg: "Avg {v}",
      t_revenue_partial: "Revenue-source breakdown is currently partial. It includes only sales units that provide source-level data.",
      t_no_revenue: "Revenue-source data unavailable for selected period.",
      t_no_daily: "Daily data unavailable for selected unit",
      t_daily_unavailable: "Daily data unavailable",
      t_units: "{n} sales unit | {n} sales units",
      t_unit_status: "Status: {s}",
      t_rank_label: "Ranked by revenue",
      t_ann_target_total: "Annual Target",
      t_ann_actual: "Actual",
      t_ann_remaining: "Remaining",
      t_ann_achievement: "Achievement",
      t_ann_complete: "Complete",
      t_ann_progress: "Progress",
      t_offline_msg: "Unable to load dashboard",
      t_offline_detail: "The server did not respond. Showing the last known data if available.",
      t_loading: "Loading…",
      t_period_label: "Period: {label}",
      t_kpi_sub_unit_all: "All configured units",
      t_kpi_sub_unit_one: "Selected unit",
      t_kpi_sub_selected_period: "Selected period",
      t_kpi_sub_target_reached: "Target reached",
      t_kpi_sub_balance: "Balance to target",
    },
    ar: {
      app_title: "آي إتش سي — لوحة مبيعات جميع الفروع",
      app_subtitle: "فورس القابضة",
      nav_overview: "نظرة عامة",
      nav_performance: "الأداء",
      nav_sources: "مصادر الإيراد",
      nav_ranking: "ترتيب الفروع",
      nav_annual: "تقرير أداء 2026",
      nav_settings: "الإعدادات",
      nav_branches: "الفروع",
      filter_period: "الفترة",
      filter_branch: "الفرع",
      filter_preset_today: "اليوم",
      filter_preset_15: "آخر 15 يوم",
      filter_preset_30: "آخر شهر",
      filter_preset_custom: "مخصص",
      filter_from: "من",
      filter_to: "إلى",
      action_refresh: "تحديث",
      action_retry: "إعادة المحاولة",
      lang_label: "English",
      status_online: "متصل",
      status_syncing: "يتم المزامنة…",
      status_offline: "غير متصل",
      status_last_sync: "آخر مزامنة",
      kpi_today_sales: "مبيعات اليوم",
      kpi_month_sales: "مبيعات الفترة",
      kpi_target: "هدف الشهر",
      kpi_achievement: "نسبة الإنجاز",
      kpi_remaining: "المتبقي من الهدف",
      kpi_required: "المطلوب اليومي",
      kpi_transactions: "المعاملات",
      kpi_avg: "متوسط المعاملة",
      sec_daily_trend: "اتجاه الإيراد",
      sec_monthly_compare: "المبيعات الشهرية مقابل الهدف",
      sec_units: "أداء وحدات البيع",
      sec_revenue: "تفصيل مصادر الإيراد",
      sec_ranking: "أداء الفروع وترتيبها",
      sec_annual: "تقرير أداء 2026 السنوي",
      rev_membership: "الاشتراكات",
      rev_daily: "الدخول اليومي",
      rev_personal: "التدريب الشخصي",
      rev_cafeteria: "الكافيتيريا",
      all_branches: "جميع الفروع",
      t_transactions: "{n} معاملة",
      t_target: "الهدف {v}",
      t_achievement: "{p} من الهدف",
      t_remaining: "المتبقي من الهدف",
      t_target_reached: "تم بلوغ الهدف",
      t_days_remaining: "{n} يوم متبقي",
      t_month_complete: "اكتملت الفترة",
      t_avg: "المتوسط {v}",
      t_revenue_partial: "تفصيل مصادر الإيراد جزئي حالياً ويشمل فقط وحدات البيع التي توفر هذه البيانات.",
      t_no_revenue: "بيانات مصادر الإيراد غير متاحة للفترة المختارة.",
      t_no_daily: "البيانات اليومية غير متاحة للوحدة المختارة",
      t_daily_unavailable: "البيانات اليومية غير متاحة",
      t_units: "{n} وحدة بيع | {n} وحدات بيع",
      t_unit_status: "الحالة: {s}",
      t_rank_label: "الترتيب حسب الإيراد",
      t_ann_target_total: "الهدف السنوي",
      t_ann_actual: "الفعلي",
      t_ann_remaining: "المتبقي",
      t_ann_achievement: "نسبة الإنجاز",
      t_ann_complete: "مكتمل",
      t_ann_progress: "التقدم",
      t_offline_msg: "تعذّر تحميل لوحة المعلومات",
      t_offline_detail: "لم يستجب الخادم. سيتم عرض آخر بيانات معروفة إن وُجدت.",
      t_loading: "جارٍ التحميل…",
      t_period_label: "الفترة: {label}",
      t_kpi_sub_unit_all: "كل الوحدات",
      t_kpi_sub_unit_one: "الوحدة المختارة",
      t_kpi_sub_selected_period: "الفترة المختارة",
      t_kpi_sub_target_reached: "تم بلوغ الهدف",
      t_kpi_sub_balance: "المتبقي من الهدف",
    },
  };

  /** Map raw backend revenue source keys to human labels. */
  const REV_SOURCE_LABELS = {
    en: { Receipt: "Membership", Daily: "Daily Pass", Personal: "Personal Training", Protein: "Cafeteria" },
    ar: { Receipt: "الاشتراكات", Daily: "الدخول اليومي", Personal: "التدريب الشخصي", Protein: "الكافيتيريا" },
  };

  let current = "en";
  const subs = new Set();

  function t(key, vars) {
    const dict = STRINGS[current] || STRINGS.en;
    let s = dict[key];
    if (s == null) s = STRINGS.en[key] != null ? STRINGS.en[key] : key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
      });
    }
    return s;
  }

  function getLang() { return current; }

  function setLang(lang) {
    if (!STRINGS[lang]) lang = "en";
    if (lang === current) return;
    current = lang;
    document.documentElement.setAttribute("lang", lang);
    document.body.dir = lang === "ar" ? "rtl" : "ltr";
    document.body.classList.toggle("lang-ar", lang === "ar");
    try { localStorage.setItem("ich.lang", lang); } catch (_) { /* ignore */ }
    subs.forEach((fn) => { try { fn(lang); } catch (_) { /* ignore */ } });
  }

  function onChange(fn) {
    subs.add(fn);
    return () => subs.delete(fn);
  }

  function init() {
    let saved = "en";
    try { saved = localStorage.getItem("ich.lang") || "en"; } catch (_) { /* ignore */ }
    setLang(saved);
  }

  function revLabel(key) {
    const d = REV_SOURCE_LABELS[current] || REV_SOURCE_LABELS.en;
    return d[key] || key;
  }

  global.ICH = global.ICH || {};
  global.ICH.i18n = { t, setLang, getLang, onChange, init, revLabel };
})(window);
