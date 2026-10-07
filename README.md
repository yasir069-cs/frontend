# Central Sales Dashboard

Centralized sales analytics and performance tracking dashboard for **Force Holding Co.** — six fitness branches:

- **Stretch Fitness — Men**
- **Stretch Fitness — Ladies**
- **IHC Express**
- **IHC Jahra** *(preview — backend pending)*
- **The Gym Fahaheel**
- **IHC Salmiya** *(preview — backend pending)*

## What changed in v2 (frontend)

A full redesign of the frontend with no backend changes. The dashboard is now a dark, premium fintech-style interface with:

- **Per-gym theming** driven by a single config in `frontend/themes.js`. Selecting a gym re-themes the entire app (charts, KPI gradients, sidebar, header, badges) in ~280 ms without re-fetching data.
- **Responsive sidebar** that collapses on desktop/laptop and slides in as a drawer on mobile/tablet. State persists in `localStorage`. Charts resize automatically via a `ResizeObserver`.
- **Stale-while-revalidate** data layer with `AbortController`-based cancellation, in-flight dedupe, exponential backoff retry, idle prefetch of adjacent months, and a per-widget error boundary.
- **Period filter** with Today / Last 15 Days / Last 1 Month / Month / Custom presets and a calendar date picker.
- **English + Arabic** with full RTL layout.
- **Skeleton loaders** (no spinners), smooth fade-in entries, and full `prefers-reduced-motion` support.
- **Branch Performance & Ranking** sorted by revenue, each branch in its own brand color.
- **Revenue source labels** mapped to *Membership / Daily Pass / Personal Training / Cafeteria*.
- **2026 Annual Performance Report** color rule: green when remaining is 0, yellow below 80 %, red below 40 %.

### Logo files

Drop your real JPGs into `frontend/assets/logos/` with these names; the app probes the `.jpg` first and falls back to the shipped `.svg` placeholder automatically:

- `stretch-men.jpg`
- `stretch-ladies.jpg`
- `ihc-express.jpg`
- `ihc.jpg` (IHC Jahra)
- `the-gym.jpg` (The Gym Fahaheel)
- `ihc-salmiya.jpg`

## Project Structure

```
CentralSalesDashboard/
├── backend/
│   └── main.py                  # FastAPI backend (unchanged)
├── frontend/
│   ├── index.html               # Single page application entrypoint
│   ├── app.js                   # Orchestrator (filters, KPIs, ranking, render)
│   ├── sidebar.js               # Responsive sidebar + drawer
│   ├── charts.js                # Themed canvas charts (line, bars, donut)
│   ├── themes.js                # Per-gym theme config (CSS variables + palette)
│   ├── data.js                  # SWR cache, retry, mocks, normalization
│   ├── i18n.js                  # English + Arabic + RTL
│   ├── icons.js                 # Inline SVG icon set
│   ├── styles.css               # Design system, dark fintech theme
│   └── assets/logos/            # Logo files (SVG fallbacks ship; drop .jpg here)
├── data/
│   ├── central.db               # SQLite local database
│   └── targets/                 # Annual targets spreadsheet templates
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
python -m http.server 8060
```
Open `http://localhost:8060` in your browser.

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

## Backend suggestions (not applied)

These would help the frontend deliver a better experience; they are **not** part of this change:

1. Add `/api/branches` returning all 6 branches (with stable codes) so the frontend doesn't have to inject mock rows for IHC Jahra and IHC Salmiya.
2. Extend `/api/dashboard?branch=…` so a single branch's dashboard is fetched in one round-trip instead of the frontend filtering the combined payload.
3. Extend the `daily` and `monthly` shapes to include per-branch keys for all six branches.
4. Add `Cache-Control: max-age=30` on `/api/dashboard` so the browser can short-circuit identical requests.
5. Standardize timestamps in responses (ISO 8601 with timezone).
