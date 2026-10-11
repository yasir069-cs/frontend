/* =============================================================
   themes.js  (v3)
   Color modes (dark/light, system-pref detection), branch
   accents for the 6-gym ICH registry, and the 8-color revenue
   palette (distinct hues — never green/red, those are reserved
   for hit/miss status only). Applies everything as CSS custom
   properties so charts re-theme instantly without re-fetch.
   ============================================================= */

"use strict";

// ----------------------------------------------------------
// Branch registry — the single source of truth for gyms.
// Exactly 6: 4 active (from backend) + 2 advance/pending.
// Do not add or remove.
// ----------------------------------------------------------
export const BRANCHES = [
  {
    code: "stretch_men",
    name_en: "Stretch Fitness Center - Men",
    name_ar: "ستريتش فيتنس سنتر - رجال",
    short: "Stretch Men",
    pending: false,
    accent: { dark: "#5B8DEF", light: "#2F54EB" },
  },
  {
    code: "stretch_ladies",
    name_en: "Stretch Fitness Center - Ladies",
    name_ar: "ستريتش فيتنس سنتر - سيدات",
    short: "Stretch Ladies",
    pending: false,
    accent: { dark: "#A78BFA", light: "#7048E8" },
  },
  {
    code: "the_gym_mishref",
    name_en: "The Gym Mishref",
    name_ar: "ذا جيم مشرف",
    short: "The Gym Mishref",
    pending: false,
    accent: { dark: "#45C4B0", light: "#0E8A80" },
  },
  {
    code: "ihc_express",
    name_en: "IHC-Express",
    name_ar: "آي إتش سي إكسبريس",
    short: "IHC-Express",
    pending: false,
    accent: { dark: "#E8B15C", light: "#9A6A1A" },
  },
  {
    code: "ihc_jahra",
    name_en: "IHC Jahra",
    name_ar: "آي إتش سي الجهراء",
    short: "Jahra",
    pending: true,
    accent: { dark: "#5BC8E8", light: "#0B7FA8" },
  },
  {
    code: "the_gym_fahaheel",
    name_en: "The Gym Fahaheel",
    name_ar: "ذا جيم الفحيحيل",
    short: "The Gym Fahaheel",
    pending: true,
    accent: { dark: "#E07A9A", light: "#B3377E" },
  },
];

export const ALL_BRANCHES = {
  code: "all",
  name_en: "All Branches",
  name_ar: "جميع الفروع",
  short: "All Branches",
  pending: false,
  accent: { dark: "#C9A24B", light: "#8A6D1B" },
  secondary: { dark: "#7C3AED", light: "#5B4BC4" },
  tertiary: { dark: "#14B8A6", light: "#0E8A80" },
};

export const BRANCH_ORDER = BRANCHES.map((b) => b.code);
export const ACTIVE_CODES = BRANCHES.filter((b) => !b.pending).map((b) => b.code);
export const PENDING_CODES = BRANCHES.filter((b) => b.pending).map((b) => b.code);

// ----------------------------------------------------------
// Revenue palette — 8 distinct hues per color mode.
// Hues: blue, violet, amber, teal, magenta, cyan, gold, slate.
// Never green/red: those are reserved for status semantics.
// ----------------------------------------------------------
export const REVENUE_KEYS = ["RECEIPT", "DAILY", "LOCKERS", "PERSONAL", "PROTEIN"];

const REVENUE_PALETTE = {
  dark: [
    "#5B8DEF", // 0 RECEIPT   — cornflower blue
    "#A78BFA", // 1 DAILY     — amethyst
    "#E8B15C", // 2 LOCKERS   — amber sand
    "#45C4B0", // 3 PERSONAL  — teal
    "#E07A9A", // 4 PROTEIN   — rose
    "#5BC8E8", // 5 extra     — cyan
    "#C9A24B", // 6 extra     — gold
    "#95A3C4", // 7 extra     — slate
  ],
  light: [
    "#2F54EB", // 0 RECEIPT
    "#7048E8", // 1 DAILY
    "#9A6A1A", // 2 LOCKERS
    "#0E8A80", // 3 PERSONAL
    "#B3377E", // 4 PROTEIN
    "#0B7FA8", // 5 extra
    "#8A6D1B", // 6 extra
    "#4A5A78", // 7 extra
  ],
};

const REV_INDEX = Object.create(null);
REVENUE_KEYS.forEach((k, i) => { REV_INDEX[k] = i; });

// Stable hash so unknown (future) revenue keys still get a
// deterministic, humanized-friendly color instead of colliding.
function hashKey(key) {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ----------------------------------------------------------
// Color mode (dark / light)
// ----------------------------------------------------------
const MODE_KEY = "ich.colorMode";
let colorMode = "dark";
const modeSubs = new Set();

export function getColorMode() {
  return colorMode;
}

export function systemColorMode() {
  try {
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch (_) { /* older engines */ }
  return "dark";
}

export function storedColorMode() {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "dark" || v === "light") return v;
  } catch (_) { /* private mode */ }
  return null;
}

export function setColorMode(mode, persist) {
  if (mode !== "dark" && mode !== "light") mode = "dark";
  colorMode = mode;
  if (persist) {
    try { localStorage.setItem(MODE_KEY, mode); } catch (_) { /* ignore */ }
  }
  applyColorVars();
  modeSubs.forEach((fn) => { try { fn(mode); } catch (_) { /* ignore */ } });
}

export function toggleColorMode() {
  setColorMode(colorMode === "dark" ? "light" : "dark", true);
}

export function onColorModeChange(fn) {
  modeSubs.add(fn);
  return () => modeSubs.delete(fn);
}

// ----------------------------------------------------------
// CSS plumbing
// ----------------------------------------------------------
function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "255,255,255";
  const n = parseInt(m[1], 16);
  return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
}

export function palette() {
  return REVENUE_PALETTE[colorMode];
}

/** Color for a revenue source key. Case-sensitive on purpose. */
export function colorForRevenue(key) {
  const p = REVENUE_PALETTE[colorMode];
  if (Object.prototype.hasOwnProperty.call(REV_INDEX, key)) {
    return p[REV_INDEX[key]];
  }
  return p[5 + (hashKey(String(key)) % 3)];
}

/** Branch accent for the active color mode. */
export function branchAccent(code) {
  if (!code || code === "all") return ALL_BRANCHES.accent[colorMode];
  const b = BRANCHES.find((x) => x.code === code);
  return (b || ALL_BRANCHES).accent[colorMode];
}

export function getBranch(code) {
  if (!code || code === "all") return ALL_BRANCHES;
  return BRANCHES.find((x) => x.code === code) || ALL_BRANCHES;
}

function applyColorVars() {
  const root = document.documentElement;
  root.setAttribute("data-color-mode", colorMode);
  const p = REVENUE_PALETTE[colorMode];
  for (let i = 0; i < p.length; i++) {
    root.style.setProperty("--rev-" + i, p[i]);
  }
}

/**
 * Apply the per-branch brand variables (accent, line, gradient).
 * The gradient is a subtle 3-color blend, theme-aware, used on
 * hero KPI cards only.
 */
export function applyBranchTheme(code) {
  const branch = getBranch(code);
  const root = document.documentElement;
  root.setAttribute("data-branch", branch.code);
  const accent = branch.accent[colorMode];
  root.style.setProperty("--brand-accent", accent);
  root.style.setProperty("--brand-line", accent);
  root.style.setProperty("--brand-fill", "rgba(" + hexToRgb(accent) + ",0.16)");
  root.style.setProperty("--brand-dot", accent);

  if (branch.code === "all") {
    const sec = branch.secondary[colorMode];
    const ter = branch.tertiary[colorMode];
    root.style.setProperty(
      "--brand-gradient",
      "linear-gradient(135deg, rgba(" + hexToRgb(accent) + ",0.16) 0%, " +
        "rgba(" + hexToRgb(sec) + ",0.10) 50%, " +
        "rgba(" + hexToRgb(ter) + ",0.14) 100%)"
    );
    root.style.setProperty("--brand-glow", "rgba(" + hexToRgb(sec) + ",0.35)");
  } else {
    const sec = shiftHueish(accent);
    root.style.setProperty(
      "--brand-gradient",
      "linear-gradient(135deg, rgba(" + hexToRgb(accent) + ",0.16) 0%, " +
        "rgba(" + hexToRgb(sec) + ",0.10) 50%, " +
        "rgba(" + hexToRgb(accent) + ",0.06) 100%)"
    );
    root.style.setProperty("--brand-glow", "rgba(" + hexToRgb(accent) + ",0.35)");
  }
  return branch;
}

/** A deterministic companion hue for single-branch gradients. */
function shiftHueish(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return accentFallback();
  const n = parseInt(m[1], 16);
  const r = Math.min(255, ((n >> 16) & 255) + 26);
  const g = Math.max(0, ((n >> 8) & 255) - 18);
  const b = Math.max(0, (n & 255) - 8);
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function accentFallback() { return "#7C3AED"; }

// ----------------------------------------------------------
// Motion preference
// ----------------------------------------------------------
export function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (_) {
    return false;
  }
}

// ----------------------------------------------------------
// Reduced transparency (disables glass effect with it)
// ----------------------------------------------------------
export function prefersReducedTransparency() {
  try {
    return window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
  } catch (_) {
    return false;
  }
}

/**
 * Initialize color mode from localStorage or system preference,
 * then keep following OS changes while the user has no explicit
 * stored choice.
 */
export function initThemes() {
  const stored = storedColorMode();
  colorMode = stored || systemColorMode();
  applyColorVars();
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (e) => {
      if (!storedColorMode()) setColorMode(e.matches ? "light" : "dark", false);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  } catch (_) { /* ignore */ }
}