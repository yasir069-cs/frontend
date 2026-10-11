/* =============================================================
   components/ticker.js  (v3)
   Number count-up animation: 800ms, ease-out-quart.
     - No layout shift: only textContent updates, the value slot
       keeps a reserved min-width and tabular-nums (CSS side)
     - Skipped instantly for prefers-reduced-motion
     - Only one animation per element: a new call cancels the
       previous rAF chain
   ============================================================= */

"use strict";

const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);

let reducedMotion = false;
try {
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onChange = (e) => { reducedMotion = e.matches; };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else if (mq.addListener) mq.addListener(onChange);
} catch (_) { /* ignore */ }

const active = new WeakMap(); // el -> { cancel }

export function tick(el, from, to, format, duration) {
  if (!el) return;
  const prev = active.get(el);
  if (prev) prev.cancel();

  const fmt = typeof format === "function" ? format : (v) => String(Math.round(v));
  const d = duration || 800;
  const start = Number(from) || 0;
  const end = Number(to) || 0;

  if (reducedMotion || start === end) {
    el.textContent = fmt(end);
    return;
  }

  const t0 = performance.now();
  let raf = 0;
  const handle = {
    cancel() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
  active.set(el, handle);

  const frame = (now) => {
    const raw = Math.min(1, (now - t0) / d);
    const e = easeOutQuart(raw);
    const v = start + (end - start) * e;
    el.textContent = fmt(v);
    if (raw < 1) raf = requestAnimationFrame(frame);
    else raf = 0;
  };
  raf = requestAnimationFrame(frame);
}
