/* =============================================================
   themes.js
   Central per-gym theme config. Drives CSS variables, chart
   palettes, KPI gradients, glow colors. Selecting a gym here
   re-themes the entire app without re-fetching data.
   ============================================================= */

(function (global) {
  "use strict";

  /**
   * Each gym defines:
   *   id            : stable code used as data key (matches /api/branches code
   *                   when one exists, else a frontend-only id)
   *   name          : display name
   *   shortName     : short label for chip/header
   *   logo          : primary logo path; .svg ships with the app, .jpg will be
   *                   used automatically if you drop a real one in
   *                   /assets/logos/ (see resolveLogo() below)
   *   primary       : main brand color
   *   secondary     : supporting color
   *   accent        : the "tell apart" color used in charts and badges so the
   *                   three blue gyms never look identical
   *   neutral       : muted text / surface tint
   *   gradient      : CSS gradient string used on KPI cards and accents
   *   glow          : rgba used for soft shadow / glow on cards
   *   onGradient    : text color readable on top of `gradient`
   *   palette       : ordered 6-shade chart palette
   *   chartLine     : primary line color for the daily trend
   *   chartFill     : translucent fill for the area under the line
   */
  const GYMS = [
    {
      id: "stretch_men",
      name: "Stretch Fitness — Men",
      shortName: "Stretch Men",
      logo: "stretch-men",
      primary: "#1E40C8",
      secondary: "#0A2A7A",
      accent: "#A9B2C0",
      neutral: "#E8ECF3",
      gradient: "linear-gradient(135deg, #1E40C8 0%, #0A2A7A 100%)",
      glow: "rgba(30, 64, 200, 0.45)",
      onGradient: "#FFFFFF",
      palette: ["#1E40C8", "#3B5DDB", "#7C8FE6", "#A9B2C0", "#C8D0E0", "#E8ECF3"],
      chartLine: "#1E40C8",
      chartFill: "rgba(30, 64, 200, 0.18)",
    },
    {
      id: "stretch_ladies",
      name: "Stretch Fitness — Ladies",
      shortName: "Stretch Ladies",
      logo: "stretch-ladies",
      primary: "#EC4F9A",
      secondary: "#F9A8D4",
      accent: "#4A4A4F",
      neutral: "#8E8E93",
      gradient: "linear-gradient(135deg, #EC4F9A 0%, #B8327A 100%)",
      glow: "rgba(236, 79, 154, 0.45)",
      onGradient: "#FFFFFF",
      palette: ["#EC4F9A", "#F472B6", "#F9A8D4", "#FBCFE8", "#FCE7F3", "#4A4A4F"],
      chartLine: "#EC4F9A",
      chartFill: "rgba(236, 79, 154, 0.20)",
    },
    {
      id: "ihc_express",
      name: "IHC Express",
      shortName: "IHC Express",
      logo: "ihc-express",
      primary: "#1F5BFF",
      secondary: "#B8327A",
      accent: "#38BDF8",
      neutral: "#C5CEDB",
      gradient: "linear-gradient(135deg, #1F5BFF 0%, #B8327A 100%)",
      glow: "rgba(31, 91, 255, 0.45)",
      onGradient: "#FFFFFF",
      palette: ["#1F5BFF", "#38BDF8", "#7DD3FC", "#B8327A", "#F472B6", "#C5CEDB"],
      chartLine: "#1F5BFF",
      chartFill: "rgba(31, 91, 255, 0.18)",
    },
    {
      id: "ihc_jahra",
      name: "IHC Jahra",
      shortName: "IHC Jahra",
      logo: "ihc",
      primary: "#1D3FA8",
      secondary: "#0B1F63",
      accent: "#2B8CFF",
      neutral: "#B7C2D3",
      gradient: "linear-gradient(135deg, #1D3FA8 0%, #0B1F63 100%)",
      glow: "rgba(29, 63, 168, 0.50)",
      onGradient: "#FFFFFF",
      palette: ["#2B8CFF", "#1D3FA8", "#4F9CF5", "#0B1F63", "#7BAEFA", "#B7C2D3"],
      chartLine: "#2B8CFF",
      chartFill: "rgba(43, 140, 255, 0.18)",
    },
    {
      id: "the_gym_mishref",
      name: "The Gym Fahaheel",
      shortName: "The Gym",
      logo: "the-gym",
      primary: "#F26B21",
      secondary: "#F59E3F",
      accent: "#FFFFFF",
      neutral: "#151515",
      // Mid-tone background means the original black neutral is too dark for
      // chart fills; we use the lighter accent for chart surfaces.
      gradient: "linear-gradient(135deg, #F26B21 0%, #F59E3F 100%)",
      glow: "rgba(242, 107, 33, 0.45)",
      onGradient: "#151515",
      palette: ["#F26B21", "#F59E3F", "#FBBF77", "#151515", "#4A4A4A", "#E5E5E5"],
      chartLine: "#F26B21",
      chartFill: "rgba(242, 107, 33, 0.20)",
    },
    {
      id: "ihc_salmiya",
      name: "IHC Salmiya",
      shortName: "IHC Salmiya",
      logo: "ihc-salmiya",
      primary: "#0B1F63",
      secondary: "#1D3FA8",
      accent: "#1F5BFF",
      neutral: "#B7C2D3",
      // Midnight base: we use the lighter accent for chart fills and on-dark
      // text, while keeping the original midnight for borders and glow.
      gradient: "linear-gradient(135deg, #0B1F63 0%, #1F5BFF 100%)",
      glow: "rgba(31, 91, 255, 0.55)",
      onGradient: "#FFFFFF",
      palette: ["#1F5BFF", "#0B1F63", "#2B8CFF", "#1D3FA8", "#7BAEFA", "#B7C2D3"],
      chartLine: "#1F5BFF",
      chartFill: "rgba(31, 91, 255, 0.20)",
    },
  ];

  /**
   * Force Holding Co. premium palette for the "All Branches" view.
   * Gold + violet + teal, intentionally distinct from any single gym so users
   * always know they're looking at the consolidated picture.
   */
  const ALL_BRANCHES = {
    id: "all",
    name: "All Branches",
    shortName: "Force Holding Co",
    logo: "all-branches",
    primary: "#C9A24B",
    secondary: "#7C3AED",
    accent: "#14B8A6",
    neutral: "#E5E7EB",
    gradient: "linear-gradient(135deg, #C9A24B 0%, #7C3AED 50%, #14B8A6 100%)",
    glow: "rgba(201, 162, 75, 0.35)",
    onGradient: "#0B0F1A",
    palette: ["#C9A24B", "#7C3AED", "#14B8A6", "#A78BFA", "#5EEAD4", "#FCD34D"],
    chartLine: "#7C3AED",
    chartFill: "rgba(124, 58, 237, 0.20)",
  };

  const ALL_THEMES = [ALL_BRANCHES, ...GYMS];

  /**
   * Look up a theme by gym id. Falls back to ALL_BRANCHES for "all" or
   * unknown ids so the rest of the app never has to null-check.
   */
  function getTheme(gymId) {
    if (!gymId || gymId === "all") return ALL_BRANCHES;
    return GYMS.find((g) => g.id === gymId) || ALL_BRANCHES;
  }

  /**
   * The order in which gyms should appear in selectors and ranking rows.
   * The first item is the default single-gym landing.
   */
  const DEFAULT_GYM_ORDER = [
    "stretch_men",
    "stretch_ladies",
    "ihc_express",
    "ihc_jahra",
    "the_gym_mishref",
    "ihc_salmiya",
  ];

  /**
   * Per-gym palette as a simple array — used in ranking/branch comparison
   * charts so each branch is instantly recognizable.
   */
  function comparisonPalette() {
    return GYMS.map((g) => g.primary);
  }

  /**
   * Apply a theme to the document root. Sets CSS variables and writes a
   * data-theme attribute so any CSS can switch on it. Returns the theme
   * object so the caller can re-render charts in the new palette.
   */
  function applyTheme(gymId) {
    const theme = getTheme(gymId);
    const root = document.documentElement;
    root.setAttribute("data-theme", theme.id);
    root.style.setProperty("--brand-primary", theme.primary);
    root.style.setProperty("--brand-secondary", theme.secondary);
    root.style.setProperty("--brand-accent", theme.accent);
    root.style.setProperty("--brand-neutral", theme.neutral);
    root.style.setProperty("--brand-gradient", theme.gradient);
    root.style.setProperty("--brand-glow", theme.glow);
    root.style.setProperty("--brand-on-gradient", theme.onGradient);
    root.style.setProperty("--brand-line", theme.chartLine);
    root.style.setProperty("--brand-fill", theme.chartFill);
    // Per-gym chart palette
    theme.palette.forEach((c, i) => {
      root.style.setProperty(`--brand-palette-${i}`, c);
    });
    return theme;
  }

  /**
   * Resolve a logo URL: prefer the .jpg if the user has dropped the real logo
   * into /assets/logos/, otherwise fall back to the shipped .svg so the app
   * never shows a broken image. We probe via <img>.error, so this is async
   * for callers that care; for plain <img src> attributes, the SVG path is
   * always safe and we'll swap the .jpg in via resolveLogoInto() below.
   */
  function logoPath(stem) {
    if (!stem) return "";
    return `assets/logos/${stem}.svg`;
  }

  /**
   * For <img> elements, probe the .jpg first and fall back to .svg.
   * Usage: <img data-logo-stem="stretch-men">  →  resolveLogoInto(img).
   */
  function resolveLogoInto(imgEl) {
    const stem = imgEl && imgEl.dataset && imgEl.dataset.logoStem;
    if (!stem) return;
    const jpg = new Image();
    jpg.onload = function () {
      imgEl.src = `assets/logos/${stem}.jpg`;
    };
    jpg.onerror = function () {
      imgEl.src = `assets/logos/${stem}.svg`;
    };
    // Trigger probe. Cache-bust the JPG so a fresh deploy is picked up.
    jpg.src = `assets/logos/${stem}.jpg?v=${Date.now()}`;
  }

  function resolveAllLogos(root) {
    const scope = root || document;
    const imgs = scope.querySelectorAll("img[data-logo-stem]");
    imgs.forEach(resolveLogoInto);
  }

  global.ICH = global.ICH || {};
  global.ICH.themes = {
    GYMS,
    ALL_BRANCHES,
    ALL_THEMES,
    DEFAULT_GYM_ORDER,
    getTheme,
    applyTheme,
    comparisonPalette,
    logoPath,
    resolveAllLogos,
  };
})(window);
