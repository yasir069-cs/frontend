/* =============================================================
   demo.js  (v3)
   Deterministic synthetic data. Same (year, month) in → byte
   identical payload out. No Math.random, no Date.now inside
   the generators (only used to know the real "today").

   The payload matches the backend's documented response shape
   exactly:
     { success: true, data: { kpis, sales_units, daily,
       monthly, revenue, today } }

   Pending gyms (Jahra, Salmiya) are NOT included here —
   data.js owns their isolation.

   Anchor values for 2026-10 (must not drift):
     kpis.sales = 211214.3  (sum of 4 active gyms)
     revenue.total = 211214.3 (5 sources, sum exact)
   ============================================================ */

"use strict";

const GYMS = [
  { code: "ihc_hawalli", name_en: "ICH Hawalli", name_ar: "آي إتش سي حولي", txRatio: 13.2 },
  { code: "ihc_farwaniya", name_en: "ICH Farwaniya", name_ar: "آي إتش سي الفروانية", txRatio: 12.8 },
  { code: "ihc_fahaheel", name_en: "ICH Fahaheel", name_ar: "آي إتش سي الفحيحيل", txRatio: 11.9 },
  { code: "ihc_mangaf", name_en: "ICH Mangaf", name_ar: "آي إتش سي المنقف", txRatio: 10.7 },
];

// Monthly sales baselines (KD), index 0 = Jan. October (idx 9)
// values are the locked anchors.
const SALES = {
  ihc_hawalli:   [51240.0, 48980.5, 57610.2, 56105.8, 59870.4, 62320.9, 65110.7, 67050.3, 70125.6, 68432.5, 66210.8, 72405.1],
  ihc_farwaniya: [42310.4, 40875.2, 47520.6, 46108.9, 49055.1, 51230.8, 53440.2, 54980.7, 57610.0, 55318.7, 53705.9, 58420.3],
  ihc_fahaheel:  [36870.9, 35540.6, 41230.8, 40105.3, 42680.5, 44560.1, 46480.6, 47820.4, 50110.2, 48273.1, 46905.7, 51030.9],
  ihc_mangaf:    [28950.3, 27905.8, 32340.1, 31460.7, 33475.9, 34950.4, 36455.2, 37510.6, 39305.8, 39190.0, 38120.5, 41540.8],
};

// Monthly targets (KD). October targets: only Farwaniya exceeds
// its target, so the confetti micro-celebration demos once.
const TARGETS = {
  ihc_hawalli:   [66000, 64000, 66000, 65000, 67000, 68000, 70000, 70500, 71500, 71500, 69500, 72000],
  ihc_farwaniya: [49500, 48000, 50000, 49000, 50500, 51500, 53000, 53500, 54500, 54000, 52500, 55000],
  ihc_fahaheel:  [45500, 44000, 46000, 45000, 46500, 47500, 49000, 49000, 50000, 49500, 48000, 50500],
  ihc_mangaf:    [39000, 38000, 39500, 38500, 40000, 40500, 41500, 42000, 42500, 42000, 41000, 43000],
};

// Locked October 2026 revenue split (sums to 211214.3 exactly).
const OCTOBER_REVENUE_2026 = {
  RECEIPT: 96704.1,
  DAILY: 44720.3,
  LOCKERS: 31010.5,
  PERSONAL: 24789.6,
  PROTEIN: 13989.8,
};

const REVENUE_KEYS = ["RECEIPT", "DAILY", "LOCKERS", "PERSONAL", "PROTEIN"];
const BASE_REV_WEIGHTS = [0.458, 0.212, 0.147, 0.117, 0.066];

// ----------------------------------------------------------
// Deterministic PRNG — mulberry32
// ----------------------------------------------------------
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

function round2(v) { return Math.round((Number(v) || 0) * 100) / 100; }
function round1(v) { return Math.round((Number(v) || 0) * 10) / 10; }

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function pad2(n) { return (n < 10 ? "0" : "") + n; }
function monthKey(year, month) { return year + "-" + pad2(month); }
function dayKey(year, month, day) { return monthKey(year, month) + "-" + pad2(day); }

/**
 * Largest-remainder partition: split `total` across `n` parts by
 * `weights` so the parts sum to `total` EXACTLY (1 decimal).
 */
function partition(total, weights, precision) {
  const p = precision === 2 ? 2 : 1;
  const scale = Math.pow(10, p);
  const totalCents = Math.round(total * scale);
  const sumW = weights.reduce((s, w) => s + w, 0) || 1;
  const raw = weights.map((w) => (totalCents * w) / sumW);
  const floor = raw.map((v) => Math.floor(v));
  let assigned = floor.reduce((s, v) => s + v, 0);
  let rem = totalCents - assigned;
  // Distribute the remainder to the largest fractional parts,
  // then to the earliest indices (keeps it fully deterministic).
  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (rem > 0 && order.length) {
    floor[order[k % order.length].i] += 1;
    rem -= 1;
    k += 1;
  }
  return floor.map((v) => v / scale);
}

function gymMonthlySales(code, year, month) {
  const base = SALES[code][month - 1];
  if (year === 2026) return base;
  const factor = Math.pow(1.05, year - 2026);
  return round1(base * factor);
}

function gymMonthlyTarget(code, year, month) {
  const base = TARGETS[code][month - 1];
  if (year === 2026) return base;
  const factor = Math.pow(1.05, year - 2026);
  return Math.round(base * factor);
}

function realToday() {
  const d = new Date();
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    iso: d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()),
  };
}

function isFutureMonth(year, month, today) {
  return year > today.year || (year === today.year && month > today.month);
}

/**
 * Build the full demo payload for a (year, month).
 * Deterministic; independent of wall-clock except for slicing
 * "today" and zeroing strictly-future months.
 */
export function getDemoDashboard(year, month) {
  const today = realToday();
  const nDays = daysInMonth(year, month);
  const future = isFutureMonth(year, month, today);

  // ---------------- Monthly per-gym figures ----------------
  const gymSales = {};
  const gymTx = {};
  const gymCustomers = {};
  GYMS.forEach((g, gi) => {
    const sales = future ? 0 : gymMonthlySales(g.code, year, month);
    const seed = year * 10000 + month * 100 + gi * 77 + 3;
    const rng = mulberry32(seed);
    const jitter = 0.98 + rng() * 0.04;
    const tx = future ? 0 : Math.round(sales / g.txRatio * jitter);
    const customers = future ? 0 : Math.round(tx * 0.62 * (0.96 + rng() * 0.08));
    gymSales[g.code] = sales;
    gymTx[g.code] = tx;
    gymCustomers[g.code] = customers;
  });

  // ---------------- sales_units ----------------
  const sales_units = GYMS.map((g) => {
    const sales = gymSales[g.code];
    const target = gymMonthlyTarget(g.code, year, month);
    const achievement = target > 0 ? round2((sales / target) * 100) : 0;
    return {
      code: g.code,
      name_en: g.name_en,
      name_ar: g.name_ar,
      sales: sales,
      transactions: gymTx[g.code],
      customers: gymCustomers[g.code],
      target: target,
      achievement_pct: achievement,
      status: "online",
      is_pending: false,
    };
  });

  // ---------------- daily ----------------
  const daily = [];
  for (let d = 1; d <= nDays; d++) {
    daily.push({ date: dayKey(year, month, d), sales: 0, transactions: 0, _parts: {} });
  }

  // Per-gym daily partition so each gym's month is exact.
  if (!future) {
    GYMS.forEach((g, gi) => {
      const monthly = gymSales[g.code];
      if (monthly <= 0) return;
      const weights = [];
      for (let d = 1; d <= nDays; d++) {
        const rng = mulberry32(year * 100000 + month * 1000 + d * 17 + gi * 7);
        weights.push(0.72 + rng() * 0.56);
      }
      const parts = partition(monthly, weights, 1);
      const monthTx = gymTx[g.code];
      for (let d = 1; d <= nDays; d++) {
        const row = daily[d - 1];
        row._parts[g.code] = parts[d - 1];
        const rng = mulberry32(year * 1000000 + month * 10000 + d * 31 + gi * 13);
        row.transactions += Math.max(0, Math.round((monthTx / nDays) * (0.8 + rng() * 0.4)));
      }
    });
    for (let d = 1; d <= nDays; d++) {
      const row = daily[d - 1];
      let s = 0;
      for (const code of Object.keys(row._parts)) s += row._parts[code];
      row.sales = round2(s);
      delete row._parts;
    }
  }

  // ---------------- monthly (12 rows) ----------------
  const monthly = [];
  for (let m = 1; m <= 12; m++) {
    let sales = 0;
    let tx = 0;
    let target = 0;
    if (!isFutureMonth(year, m, today)) {
      GYMS.forEach((g, gi) => {
        const ms = gymMonthlySales(g.code, year, m);
        const seed = year * 10000 + m * 100 + gi * 77 + 3;
        const rng = mulberry32(seed);
        const jitter = 0.98 + rng() * 0.04;
        sales += ms;
        tx += Math.round(ms / g.txRatio * jitter);
        target += gymMonthlyTarget(g.code, year, m);
      });
    }
    sales = round2(sales);
    target = Math.round(target);
    monthly.push({
      month: monthKey(year, m),
      sales: sales,
      transactions: tx,
      target: target,
      achievement_pct: target > 0 ? round2((sales / target) * 100) : 0,
    });
  }

  // ---------------- revenue ----------------
  let revenueSources;
  const monthSalesTotal = round2(
    GYMS.reduce((s, g) => s + gymSales[g.code], 0)
  );
  if (year === 2026 && month === 10) {
    revenueSources = OCTOBER_REVENUE_2026;
  } else if (monthSalesTotal > 0) {
    const rng = mulberry32(year * 10000 + month * 100 + 999);
    const weights = BASE_REV_WEIGHTS.map((w) => Math.max(0.01, w + (rng() - 0.5) * 0.06));
    const parts = partition(monthSalesTotal, weights, 1);
    revenueSources = {};
    REVENUE_KEYS.forEach((k, i) => { revenueSources[k] = parts[i]; });
  } else {
    revenueSources = { RECEIPT: 0, DAILY: 0, LOCKERS: 0, PERSONAL: 0, PROTEIN: 0 };
  }

  const revenue = {
    sources: revenueSources,
    partial: false,
    total: round2(REVENUE_KEYS.reduce((s, k) => s + revenueSources[k], 0)),
  };

  // ---------------- kpis + today ----------------
  const kpiSales = monthSalesTotal;
  const kpiTx = GYMS.reduce((s, g) => s + gymTx[g.code], 0);
  const kpiCustomers = GYMS.reduce((s, g) => s + gymCustomers[g.code], 0);
  const kpis = {
    sales: kpiSales,
    transactions: kpiTx,
    customers: kpiCustomers,
    aov: kpiTx > 0 ? round2(kpiSales / kpiTx) : 0,
  };

  // "today" only exists inside the real current month; other
  // months report zero against their own last day.
  let todayRow = { date: monthKey(year, month) + "-" + pad2(nDays), sales: 0, transactions: 0 };
  if (!future && year === today.year && month === today.month) {
    const row = daily[today.day - 1];
    if (row) todayRow = { date: today.iso, sales: row.sales, transactions: row.transactions };
  }

  return {
    success: true,
    data: {
      kpis,
      sales_units,
      daily,
      monthly,
      revenue,
      today: todayRow,
    },
  };
}
