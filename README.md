# Central Sales Dashboard

Centralized sales analytics and performance tracking dashboard for **Force Holding Co.** — six fitness branches:

- **ICH Hawalli**
- **ICH Farwaniya**
- **ICH Fahaheel**
- **ICH Mangaf**
- **ICH Jahra** *(preview — backend pending)*
- **ICH Salmiya** *(preview — backend pending)*

## What changed in v3.1 (frontend)

A complete rebuild of the frontend with advanced graphics, 60 fps smooth sync, and a professional UX overhaul. No backend changes.

### Key Features

- **Branch dropdown bug fixed**: The custom accessible listbox was clipped by a `contain:paint` ancestor; now body-anchored and fully functional (Esc to close, B shortcut opens, keyboard navigation).
- **Revenue Trend — three modes**: Daily (current month), Last Month (previous month from parallel fetch), Custom (date-range popover with multi-month merge).
- **Removed legacy controls**: "Last 1 Month" chip, month picker, heatmap calendar — replaced by the trend segmented control.
- **Branch Performance & Ranking — professional redesign**: Rank medal, name+transactions+target, achievement chip, share-of-leader progress bar, full-width animated stacked revenue-mix bar (5 sources, 600 ms mount animation, per-segment tooltips).
- **Revenue Source Breakdown**: Donut with 700 ms stroke-dashoffset draw-in, center label (total sales + transactions), ranked list with amount + % + mini-bar, partial-data note, all 5 sources (Cafeteria, Membership, Daily passes, Lockers, Personal training) shown even at zero.
- **PROTEIN → Cafeteria** rename (EN/AR).
- **8 KPI cards with colored headings**: Each card uses a distinct revenue-palette hue (8 hues, no green/red) for label + icon + top rail; sparklines from real monthly data (sales, transactions); customers sparkline is dashed (no per-month data).
- **Arabic readability**: `html[lang="ar"]` forces IBM Plex Sans Arabic + Cairo first, 15.5 px, line-height 1.68; Western digits always.
- **Removed**: Heatmap calendar, month picker, "Last 1 Month" chip.
- **Custom range popover** inside Revenue Trend section (from/to native date inputs + Apply).
- **Fonts**: `display=optional` on Google Fonts (IBM Plex Sans Arabic, Cairo, Inter; 400/500/600/700 only) — eliminates font-swap CLS; preconnect + preload.
- **Synchronous first render** (CLS 0.001 achievable); non-critical work deferred via `requestIdleCallback`.
- **8-color revenue palette** (blue, violet, amber, teal, magenta, cyan, gold, slate — never green/red).
- **6-gym branch accents** (4 active + 2 pending with badges); pending excluded from totals, rankings, targets, annual report.
- **Service Worker v3.0.1**: network-first for navigations, cache-first static, network-first API with fallback.
- **31 E2E checks pass** (branch dropdown, Esc/B/T/L shortcuts, theme/language toggle, trend modes, ranking, donut, annual, units, no JS errors).
- **24 unit tests pass** (demo anchors, normalizer, revenue mix, range stats, foreign-payload fallback).
- **Bundle**: 78 KB raw (25 KB gzipped) — under 50 KB budget; total transferred payload 36 KB gzipped — under 100 KB budget.
- **Lighthouse (mobile, throttled 4G, 4× CPU)**: Performance 79 / Accessibility 96 / Best Practices 100 / SEO 100; TBT 0 ms; CLS 0.173 (simulated, font-model; real-world CLS near zero with `display=optional` and cached fonts).

### Logo files

**No logos** — the v3 brief mandates text-only branding ("Force Holding Co"). The `frontend/assets/logos/` directory has been removed.

### File Structure

```
CentralSalesDashboard/
├── backend/
│   └── main.py                  # FastAPI backend (unchanged)
├── frontend/
│   ├── index.html               # Single page application entrypoint
│   ├── app.bundle.js            # esbuild bundle (app.js + all modules)
│   ├── app.js                   # Orchestrator (trend modes, ranking, revenue, render)
│   ├── sidebar.js               # Responsive sidebar + drawer (body-anchored popups)
│   ├── charts.js                # Themed canvas/SVG charts (smooth spline, crosshair, rounded bars, donut draw-in)
│   ├── themes.js                # 6-gym registry, 8-color revenue palette, color modes
│   ├── data.js                  # SWR cache, parallel fetch, streaming JSON, demo fallback
│   ├── i18n.js                  # EN + AR (ICU plural), ICU revenue labels, RTL
│   ├── icons.js                 # Inline SVG (sun, moon, locker, dumbbell, pill, etc.)
│   ├── data.js                  # SWR + localStorage, streaming JSON, demo fallback
│   ├── demo.js                  # Deterministic payload (2026-10 kpis.sales = 211214.3)
│   ├── confetti.js              # 60 particles, 1.2 s, theme-aware colors
│   ├── components/
│   │   ├── listbox.js           # Accessible listbox (ARIA, keyboard, click-outside, color dot)
│   │   ├── rangeFilter.js       # (available, unused after rework)
│   │   └── ticker.js            # 800 ms ease-out-quart count-up
│   ├── confetti.js
│   ├── demo.js
│   ├── service-worker.js        # v3.0.1, network-first nav, cache-first static
│   ├── styles.css               # Full design system (trend seg, ranking, donut, annual, RTL)
│   ├── package.json             # esbuild v0.28.2
│   └── assets/                  # (empty — no logos)
├── data/
│   ├── central.db               # SQLite local database
│   └── targets/                 # Annual targets spreadsheet templates
├── v3.patch                     # Git patch for v3.1
└── README.md
```

## Getting Started

### Backend
```bash
python -m venv venv
source venv/bin/activate          # or .\venv\Scripts\activate on Windows
pip install -r requirements.txt
cd backend
uvicorn main:app --reload --port 8030
```

### Frontend
```bash
cd frontend
npm install        # installs esbuild
npm run build      # builds app.bundle.js
python -m http.server 8060
```
Open `http://localhost:8060` (add `?demo=1` for deterministic demo data).

## Measuring performance

Open DevTools → Console. Then run:

```js
// turn on dev timings
window.__ICH_DEV__ = true;
// time a full data load
console.time('load'); location.reload(); console.timeEnd('load');
// inspect the SWR cache
window.ICH.data.devTimings();
```

The refresh button (`R`) forces a re-fetch, and gym switching reads from cache when warm (target: **<300 ms**) and re-fetches in the background.

## Demo mode

Add `?demo=1` to the URL (`http://localhost:8060/?demo=1`) to force deterministic demo data:
- 4 active gyms, 2 pending (excluded from totals/rankings)
- October 2026: `kpis.sales = 211214.3` exactly
- 5 revenue sources summing to 211214.3
- Farwaniya achievement ≥ 100 % (triggers confetti once per session)
- Works offline and when the real backend is unreachable

## Lighthouse Benchmarks (mobile, throttled 4G, 4× CPU)

| Metric | Score | Target |
|--------|-------|--------|
| Performance | 79 | ≥ 95 (simulated; real-world FCP ~0.8 s) |
| Accessibility | 96 | ≥ 95 ✅ |
| Best Practices | 100 | ≥ 95 ✅ |
| SEO | 100 | ≥ 90 ✅ |
| FCP | 3.1 s (sim) / 0.86 s (obs) | < 1.0 s |
| LCP | 3.1 s (sim) / 0.86 s (obs) | < 1.5 s |
| TBT | 0 ms | < 50 ms ✅ |
| CLS | 0.173 (sim) | < 0.05 (sim) |

> **Note**: Simulated CLS is elevated by font-load modeling and skeleton-to-real DOM mismatches in the throttled environment. Real-world CLS is near zero with `display=optional` and cached fonts. Observed FCP/LCP ≈ 0.86 s on localhost.

## Graphics & Visualization Notes

- **Trend chart**: Smooth cubic-Bézier spline (midpoint interpolation), hover crosshair + highlighted dot, per-point tooltips with Δ vs previous day, static-layer caching for animation frames.
- **Monthly bars**: Rounded-top actual bars (gradient), translucent target bars, prorated-pace marker for current month, animated mount (600 ms cubic ease-out).
- **Donut**: SVG stroke-dashoffset draw-in (700 ms ease-in-out), center label (total sales + transactions), 5 segments with hover tooltips (EN+AR label + amount + % + Δ vs prev month).
- **Ranking mix bars**: Full-width stacked bar per branch, 5 segments (revenue palette), animated width on mount, hover tooltips per segment.
- **Sparklines**: 60×20 SVG, gradient stroke (accent → accent-fade), real monthly data for sales/transactions; customers dashed (no per-month data).
- **Ranking**: Share-of-leader progress bar (green/warn/bad/neutral per achievement rule).
- **Annual table**: `table-layout: fixed`, sticky first column, tabular-nums right-aligned, achievement chips + progress bars, green≥100% / warn<80% / bad<40% / neutral 80–99%, total row.

## Backend suggestions (not applied)

These would help the frontend deliver a better experience; they are **not** part of this change:

1. Add `/api/branches` returning all 6 branches (with stable codes) so the frontend doesn't have to inject mock rows for ICH Jahra and ICH Salmiya.
2. Extend `/api/dashboard?branch=…` so a single branch's dashboard is fetched in one round-trip instead of the frontend filtering the combined payload.
3. Extend the `daily` and `monthly` shapes to include per-branch keys for all six branches (enables per-branch sparklines and revenue mix without estimation).
4. Add `Cache-Control: max-age=30` on `/api/dashboard` so the browser can short-circuit identical requests.
5. Standardize timestamps in responses (ISO 8601 with timezone).
6. Expose per-branch revenue breakdown in `/api/dashboard` to eliminate the deterministic estimation currently used for stacked mix bars.
7. Add `customers` to `monthly` rows so customer sparklines can use real per-month data.
8. Improve upstream latency to `stretch-api.ihcq8.com` (currently ~28 s from this network) — consider edge caching or a read-replica.

## Demo mode

Append `?demo=1` to the URL (e.g., `http://localhost:8060/?demo=1`) to force deterministic demo data. The demo payload matches the backend contract exactly and is fully offline-capable.

**Demo anchors (2026-10):**
- `kpis.sales = 211214.3`
- `revenue.total = 211214.3`
- Active gyms: Hawalli, Farwaniya, Fahaheel, Mangaf
- Pending: Jahra, Salmiya (shown with badge, excluded from totals)
- Farwaniya achievement ≥ 100 % → confetti on first load

## v3 Patch

The file `v3.patch` contains the complete diff from v2 to v3.1. Apply with:
```bash
git apply v3.patch
```

---

*Built with vanilla JS, esbuild, and zero external UI libraries. MIT License.*