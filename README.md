# Central Sales Dashboard

Centralized sales analytics and performance tracking dashboard for **Force Holding Co.** — six fitness branches:

- **Stretch Fitness Center - Men**
- **Stretch Fitness Center - Ladies**
- **The Gym Mishref**
- **IHC-Express**
- **IHC Jahra** *(advance — backend pending)*
- **The Gym Fahaheel** *(advance — backend pending)*

## What changed in v3.1 (frontend)

A complete rebuild of the frontend with advanced graphics, 60 fps smooth sync, and a professional UX overhaul. No backend changes.

### Key Features

- **Branch dropdown bug fixed**: The custom accessible listbox was clipped by a `contain:paint` ancestor; now body-anchored and fully functional (Esc to close, B shortcut opens, keyboard navigation).
- **Revenue Trend — five period chips**: Today / Last 15 Days / Last 1 Month / Month / Custom (native date inputs with a lean multi-month merge) drive the daily trend chart.
- **Removed legacy controls**: month picker, heatmap calendar — replaced by the period chips row in the filters bar.
- **Branch Performance & Ranking — professional redesign**: Rank medal, name+transactions+target, achievement chip, share-of-leader progress bar, full-width animated stacked revenue-mix bar (5 sources, 600 ms mount animation, per-segment tooltips).
- **Revenue Source Breakdown**: Donut with 700 ms stroke-dashoffset draw-in, center label (total sales + transactions), ranked list with amount + % + mini-bar, partial-data note, all 5 sources (Cafeteria, Memberships, Daily passes, Lockers, Personal training) shown even at zero.
- **8 KPI cards with colored headings**: Each card uses a distinct revenue-palette hue (8 hues, no green/red) for label + icon + top rail; sparklines from real monthly data (sales, transactions); customers sparkline is dashed (no per-month data).
- **Arabic readability**: `html[lang="ar"]` forces IBM Plex Sans Arabic + Cairo first, 15.5 px, line-height 1.68; Western digits always.
- **Custom range inputs** in the filters row (from/to native date inputs + Apply).
- **Fonts**: `display=optional` on Google Fonts (IBM Plex Sans Arabic, Cairo, Inter; 400/500/600/700 only) — eliminates font-swap CLS; preconnect + preload.
- **Chunked first paint**: KPI cards and the trend chart render synchronously; ranking, revenue, monthly, annual and units each render in their own animation-frame task (rAF with a `setTimeout` fallback), so boot work no longer lands in one long task. Full re-renders (refresh, language, theme, bfcache restore) stay synchronous.
- **Below-fold render skipping**: every `.section` below the KPI overview uses `content-visibility: auto` + `contain-intrinsic-size`, so offscreen sections skip layout/paint on first paint.
- **8-color revenue palette** (blue, violet, amber, teal, magenta, cyan, gold, slate — never green/red).
- **6-gym branch accents** (4 active + 2 advance with badges); advance excluded from totals, rankings, targets, annual report.
- **Service Worker v3.1.3** (cache generation `ich-v3.1.3`): network-first for navigations, cache-first static, network-first API with offline fallback.
- **32 E2E checks pass** (branch dropdown, Esc/B/T/L shortcuts, theme/language toggle, period chips, ranking, donut, annual, units, demo-pill removal, no JS errors).
- **28 unit checks pass** (demo anchors, normalizer, revenue mix, range stats, foreign-payload fallback).
- **Bundle**: 81 KB raw (26 KB gzipped) — under the 50 KB gzipped budget.
- **Lighthouse (mobile, throttled 4G, 4x CPU)**: Performance 87 / Accessibility 96 / Best Practices 100 / SEO 100; FCP 1.43 s, LCP 2.49 s, TBT 0.43 s, CLS 0.002.

### Production prep (v3.1.3)

- **Demo pill removed**: the header no longer shows a gray "Demo data" pill. The silent demo fallback stays — with the backend unreachable (or with `?demo=1`) the dashboard renders deterministic demo data; only the Online/Offline/Syncing status pill remains.
- **Production-ready API base**: `data.js` targets same-origin `/api/...` unless the page is served from `localhost`/`127.0.0.1` (dev default `http://localhost:8030`) or `window.ICH_API_BASE` is set (see Deployment).
- **Lean custom ranges**: a 3-month custom period now costs 3 API requests (one lean per-month fetch, SWR-cached) instead of 9 (each month no longer drags prev/next context).
- **Fixed**: a `[hidden]`-vs-inline-style conflict that kept the custom date inputs always visible, an unescaped tooltip label, dead SWR and service-worker branches, mojibake in a sidebar comment, and stale v3.0 footer branding.

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
│   ├── app.js                   # Orchestrator (period chips, ranking, revenue, render)
│   ├── sidebar.js               # Responsive sidebar + drawer
│   ├── charts.js                # Themed canvas/SVG charts (smooth spline, crosshair, donut draw-in)
│   ├── themes.js                # 6-gym registry, 8-color revenue palette, color modes
│   ├── data.js                  # SWR cache, streaming JSON, demo fallback, same-origin API base
│   ├── i18n.js                  # EN + AR (ICU plural), ICU revenue labels, RTL
│   ├── icons.js                 # Inline SVG (sun, moon, locker, dumbbell, pill, etc.)
│   ├── demo.js                  # Deterministic payload (2026-10 kpis.sales = 211214.3)
│   ├── confetti.js              # 60 particles, 1.2 s, theme-aware colors
│   ├── components/
│   │   ├── listbox.js           # Accessible listbox (ARIA, keyboard, click-outside, color dot)
│   │   ├── rangeFilter.js       # (available, unused after rework)
│   │   └── ticker.js            # 800 ms ease-out-quart count-up
│   ├── service-worker.js        # v3.1.3, network-first nav, cache-first static
│   ├── styles.css               # Full design system (chips, ranking, donut, annual, RTL)
│   └── package.json             # esbuild v0.28.2
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

## Demo mode

Append `?demo=1` to the URL (e.g., `http://localhost:8060/?demo=1`) to force deterministic demo data. The demo payload matches the backend contract exactly and is fully offline-capable. Since v3.1.3 the fallback is silent — there is no header indicator anymore.

**Demo anchors (2026-10):**
- `kpis.sales = 211214.3`
- `revenue.total = 211214.3`
- 4 active gyms (Stretch Men, Stretch Ladies, The Gym Mishref, IHC-Express)
- 2 advance/pending: IHC Jahra, The Gym Fahaheel (shown with badge, excluded from totals)
- Stretch Ladies achievement >= 100% (triggers confetti once per session)

## Deployment (company server)

1. **Copy the package** — unzip `central-sales-dashboard.zip` on the server. It contains `backend/`, `frontend/`, `data/`, `README.md` and `requirements.txt` (no venv, node_modules or git metadata).
2. **Serve `frontend/` from any static web server** (nginx, Apache, IIS, or equivalent), ideally behind the same origin as the backend. With nginx: point the site root at `frontend/` and proxy `/api/` to the backend port.
3. **Run the backend** with uvicorn, e.g. from the repo root: `uvicorn backend.main:app --host 0.0.0.0 --port 8030` (venv active).
4. **Frontend API calls default to same-origin** — in production the dashboard calls `/api/...` on its own origin. When served from `localhost`/`127.0.0.1` it automatically targets `http://localhost:8030` instead. If the backend lives on a *different* origin, set the override **before** `app.bundle.js` loads:
   ```html
   <script>window.ICH_API_BASE = "https://api.example.com"</script>
   ```
5. **Rebuild after source changes** with `npm run build` in `frontend/` (esbuild regenerates `app.bundle.js`). Also bump the `?v=` cache-busters in `index.html` and the service-worker precache so returning clients pick up the new bundle.

## Lighthouse Benchmarks (mobile, throttled 4G, 4x CPU)

| Metric | Score | Target |
|--------|-------|--------|
| Performance | 87 | >= 80 |
| Accessibility | 96 | >= 95 |
| Best Practices | 100 | >= 95 |
| SEO | 100 | >= 90 |
| FCP | 1.43 s (sim) | < 2.0 s |
| LCP | 2.49 s (sim) | < 2.5 s |
| TBT | 0.43 s (sim) | < 0.5 s |
| CLS | 0.002 | < 0.05 |

> **Note**: Wave-2 numbers. The first render is chunked (one section per animation-frame task) and below-fold sections use `content-visibility: auto`, which cut TBT from ~1.9—2.5 s (the monolithic first render, previously masked by idle deferral) to ~0.4 s while CLS stayed effectively zero — the skeleton DOM mirrors the rendered structure.

## Graphics & Visualization Notes

- **Trend chart**: Smooth cubic-Bezier spline (midpoint interpolation), hover crosshair + highlighted dot, per-point tooltips with delta vs previous day, static-layer caching for animation frames.
- **Monthly bars**: Rounded-top actual bars (gradient), translucent target bars, prorated-pace marker for current month, animated mount (600 ms cubic ease-out).
- **Donut**: SVG stroke-dashoffset draw-in (700 ms ease-in-out), center label (total sales + transactions), 5 segments with hover tooltips (EN+AR label + amount + % + delta vs prev month).
- **Ranking mix bars**: Full-width stacked bar per branch, 5 segments (revenue palette), animated width on mount, hover tooltips per segment.
- **Sparklines**: 60x20 SVG, gradient stroke (accent to accent-fade), real monthly data for sales/transactions; customers dashed (no per-month data).
- **Ranking**: Share-of-leader progress bar (green/warn/bad/neutral per achievement rule).
- **Annual table**: `table-layout: fixed`, sticky first column, tabular-nums right-aligned, achievement chips + progress bars, green>=100% / warn<80% / bad<40% / neutral 80-99%, total row.

## Backend suggestions (not applied)

These would help the frontend deliver a better experience; they are **not** part of this change:

1. Add `/api/branches` returning all 6 branches (with stable codes) so the frontend doesn't have to inject rows for IHC Jahra and The Gym Fahaheel.
2. Extend `/api/dashboard?branch=...` so a single branch's dashboard is fetched in one round-trip instead of the frontend filtering the combined payload.
3. Extend the `daily` and `monthly` shapes to include per-branch keys for all six branches (enables per-branch sparklines and revenue mix without estimation).
4. Add `Cache-Control: max-age=30` on `/api/dashboard` so the browser can short-circuit identical requests.
5. Standardize timestamps in responses (ISO 8601 with timezone).
6. Expose per-branch revenue breakdown in `/api/dashboard` to eliminate the deterministic estimation currently used for stacked mix bars.
7. Add `customers` to `monthly` rows so customer sparklines can use real per-month data.
8. Improve upstream latency to `stretch-api.ihcq8.com` (currently ~28 s from this network) — consider edge caching or a read-replica.

## v3 Patch

The file `v3.patch` contains the complete diff from v2 to v3.1. Apply with:
```bash
git apply v3.patch
```

---

*Built with vanilla JS, esbuild, and zero external UI libraries. MIT License.*
