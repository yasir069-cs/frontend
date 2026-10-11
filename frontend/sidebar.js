/* =============================================================
   sidebar.js  (v3)
     - Desktop: expanded / collapsed (persisted)
     - Mobile: off-canvas drawer with overlay, body scroll lock,
       Esc and outside-click close, ARIA wiring
     - Nav items smooth-scroll to their sections (instant for
       reduced-motion) with an IntersectionObserver scrollspy
     - Emits "ich:layoutchange" so charts redraw once the
       transition settles
   ============================================================= */

"use strict";

const STORAGE_KEY = "ich.sidebar";
const DESKTOP_MQ = "(min-width: 881px)";

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mode: "expanded" };
    const parsed = JSON.parse(raw);
    if (parsed && (parsed.mode === "expanded" || parsed.mode === "collapsed")) return parsed;
  } catch (_) { /* ignore */ }
  return { mode: "expanded" };
}

function writeState(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
}

export function initSidebar(opts) {
  const app = document.getElementById("app");
  if (!app) return;
  const overlay = app.querySelector(".sidebar-overlay");
  const sidebar = app.querySelector(".sidebar");
  const state = readState();
  const o = opts || {};

  let reducedMotion = false;
  try { reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { /* ignore */ }

  function isDesktop() {
    return window.matchMedia(DESKTOP_MQ).matches;
  }

  // First paint without a jump.
  if (isDesktop()) document.documentElement.setAttribute("data-sidebar", state.mode);
  else document.documentElement.setAttribute("data-sidebar", "mobile-closed");

  function toggle() {
    if (isDesktop()) {
      const next = document.documentElement.getAttribute("data-sidebar") === "collapsed" ? "expanded" : "collapsed";
      document.documentElement.setAttribute("data-sidebar", next);
      writeState({ mode: next });
      window.dispatchEvent(new Event("ich:layoutchange"));
    } else {
      const openNow = document.documentElement.getAttribute("data-sidebar") === "mobile-open";
      document.documentElement.setAttribute("data-sidebar", openNow ? "mobile-closed" : "mobile-open");
      document.body.classList.toggle("drawer-open", !openNow);
      if (openNow && sidebar) sidebar.setAttribute("aria-hidden", "false");
      window.dispatchEvent(new Event("ich:layoutchange"));
    }
  }

  function closeMobile() {
    if (!isDesktop() && document.documentElement.getAttribute("data-sidebar") === "mobile-open") {
      document.documentElement.setAttribute("data-sidebar", "mobile-closed");
      document.body.classList.remove("drawer-open");
    }
  }

  const btn = document.querySelector('[data-action="toggle-sidebar"]');
  if (btn) btn.addEventListener("click", toggle);
  if (overlay) overlay.addEventListener("click", closeMobile);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobile();
  }, { passive: true });

  // Breakpoint changes.
  const mql = window.matchMedia(DESKTOP_MQ);
  function onMq(e) {
    if (e.matches) {
      document.documentElement.setAttribute("data-sidebar", readState().mode);
      document.body.classList.remove("drawer-open");
    } else {
      document.documentElement.setAttribute("data-sidebar", "mobile-closed");
    }
    window.dispatchEvent(new Event("ich:layoutchange"));
  }
  if (mql.addEventListener) mql.addEventListener("change", onMq);
  else if (mql.addListener) mql.addListener(onMq);

  // Nav → smooth scroll to sections + scrollspy.
  const navItems = Array.from(app.querySelectorAll(".nav-item"));
  const sections = navItems
    .map((n) => document.getElementById("sec-" + (n.dataset.nav || "")))
    .filter(Boolean);

  navItems.forEach((n) => {
    n.addEventListener("click", () => {
      const target = document.getElementById("sec-" + (n.dataset.nav || ""));
      if (target) {
        target.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
      }
      navItems.forEach((x) => x.classList.remove("active"));
      n.classList.add("active");
      closeMobile();
      if (o.onNav) o.onNav(n.dataset.nav || "");
    });
  });

  if (typeof IntersectionObserver !== "undefined" && sections.length) {
    const spy = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (!item.isIntersecting) return;
        const id = item.target.id.replace(/^sec-/, "");
        navItems.forEach((x) => x.classList.toggle("active", x.dataset.nav === id));
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    sections.forEach((s) => spy.observe(s));
  }

  // Auto-collapse on narrow desktops.
  if (isDesktop() && window.innerWidth < 1100) {
    document.documentElement.setAttribute("data-sidebar", "collapsed");
  }

  // Chart-resize events when the main column changes size.
  const main = app.querySelector(".main");
  if (main && typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event("ich:layoutchange"));
    });
    ro.observe(main);
  }
  let raf = 0;
  window.addEventListener("resize", () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => window.dispatchEvent(new Event("ich:layoutchange")));
  }, { passive: true });

  return { toggle, closeMobile };
}
