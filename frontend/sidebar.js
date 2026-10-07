/* =============================================================
   sidebar.js
   Responsive sidebar:
     - Desktop/laptop: toggle button in header; expanded (~264px)
       and collapsed icon-only (~76px) with tooltips. Charts
       resize after the transition via ResizeObserver.
     - Mobile/tablet: off-canvas drawer with overlay; closes on
       outside click, ESC, and route change.
     - Persists state in localStorage, no layout jump on load.
     - Keyboard accessible with aria-* attributes.

   Root-cause of the original "bug": the project had no sidebar
   at all — only a topbar. The user reported it as a collapse bug
   on phones because there was nothing to collapse. We now ship a
   real sidebar.
   ============================================================= */

(function (global) {
  "use strict";

  const STORAGE_KEY = "ich.sidebar";
  const DESKTOP_MQ = "(min-width: 881px)";

  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { mode: "expanded" };
      const parsed = JSON.parse(raw);
      if (parsed && (parsed.mode === "expanded" || parsed.mode === "collapsed")) {
        return parsed;
      }
    } catch (_) { /* ignore */ }
    return { mode: "expanded" };
  }
  function writeState(s) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (_) { /* ignore */ }
  }

  /**
   * Init sidebar on the existing DOM. Expects:
   *   <div class="app" id="app">     (grid container)
   *     <aside class="sidebar">…</aside>
   *     <div class="sidebar-overlay">…</div>
   *     <div class="main">…</div>
   *   </div>
   *   A header button with data-action="toggle-sidebar"
   */
  function init(opts) {
    const app = document.getElementById("app");
    if (!app) return;
    const overlay = app.querySelector(".sidebar-overlay");
    const sidebar = app.querySelector(".sidebar");
    const state = readState();

    function isDesktop() { return window.matchMedia(DESKTOP_MQ).matches; }

    // Apply state without a jump on first paint.
    if (isDesktop()) {
      app.setAttribute("data-sidebar", state.mode);
    } else {
      app.setAttribute("data-sidebar", "mobile-closed");
    }

    function toggle() {
      if (isDesktop()) {
        const next = app.getAttribute("data-sidebar") === "collapsed" ? "expanded" : "collapsed";
        app.setAttribute("data-sidebar", next);
        writeState({ mode: next });
        // Charts need to know about the resize
        window.dispatchEvent(new Event("ich:layoutchange"));
      } else {
        const open = app.getAttribute("data-sidebar") === "mobile-open";
        app.setAttribute("data-sidebar", open ? "mobile-closed" : "mobile-open");
      }
    }
    function closeMobile() {
      if (!isDesktop() && app.getAttribute("data-sidebar") === "mobile-open") {
        app.setAttribute("data-sidebar", "mobile-closed");
      }
    }

    // Header button
    const btn = document.querySelector('[data-action="toggle-sidebar"]');
    if (btn) btn.addEventListener("click", toggle);

    // Overlay click
    if (overlay) overlay.addEventListener("click", closeMobile);

    // ESC closes mobile drawer
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMobile();
    });

    // Re-evaluate on breakpoint change
    const mql = window.matchMedia(DESKTOP_MQ);
    function onMq(e) {
      if (e.matches) {
        // Switched to desktop: restore persisted mode
        const s = readState();
        app.setAttribute("data-sidebar", s.mode);
      } else {
        app.setAttribute("data-sidebar", "mobile-closed");
      }
      window.dispatchEvent(new Event("ich:layoutchange"));
    }
    if (mql.addEventListener) mql.addEventListener("change", onMq);
    else if (mql.addListener) mql.addListener(onMq);

    // Hook nav items: clicking a nav item on mobile should close the drawer
    app.querySelectorAll(".nav-item").forEach((n) => {
      n.addEventListener("click", () => {
        app.querySelectorAll(".nav-item.active").forEach((x) => x.classList.remove("active"));
        n.classList.add("active");
        closeMobile();
        if (opts && typeof opts.onNav === "function") {
          opts.onNav(n.dataset.nav || "");
        }
      });
    });

    // Auto-collapse the sidebar on very narrow viewports on first paint.
    if (isDesktop() && window.innerWidth < 1100) {
      app.setAttribute("data-sidebar", "collapsed");
    }

    // ResizeObserver on the main content so charts can re-render at the
    // exact moment the CSS transition ends (or earlier, for snappier feel).
    const main = app.querySelector(".main");
    if (main && typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => {
        window.dispatchEvent(new Event("ich:layoutchange"));
      });
      ro.observe(main);
    }
    // Fallback: also listen for window resize (debounced via rAF)
    let raf = 0;
    window.addEventListener("resize", () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => window.dispatchEvent(new Event("ich:layoutchange")));
    });
  }

  global.ICH = global.ICH || {};
  global.ICH.sidebar = { init };
})(window);
