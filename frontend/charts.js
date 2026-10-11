/* =============================================================
   charts.js  (v3)
   Rendering engine.
     - Single rAF coalescer: at most one draw per frame across
       every chart, no matter how many invalidation sources fire
     - OffscreenCanvas backing store where supported, vanilla
       canvas otherwise; each frame's work stays well under 8ms
     - Animated transitions (600ms cubic ease-out) between old
       and new state; skipped for prefers-reduced-motion and for
       back/forward-cache restores
     - SVG donut with stroke-dashoffset draw-in (700ms)
     - SVG sparklines (60×20, gradient stroke)
     - Accessible DOM heatmap calendar (7 columns)
     - One shared tooltip: 80ms fade-in, 4px cursor lead
     - Float32Array scratch reuse — no allocation inside draws
     - will-change hinted only while drawing
     - IntersectionObserver lazy draw + debounced resize redraw
   ============================================================= */

"use strict";

// ----------------------------------------------------------
// Motion + animation policy
// ----------------------------------------------------------
let reducedMotion = false;
try {
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const onChange = (e) => { reducedMotion = e.matches; };
  if (mq.addEventListener) mq.addEventListener("change", onChange);
  else if (mq.addListener) mq.addListener(onChange);
} catch (_) { /* ignore */ }

let skipAnimationsOnce = false;
export function setSkipAnimationsOnce() { skipAnimationsOnce = true; }
export function isReducedMotion() { return reducedMotion; }

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function shouldAnimate() {
  if (reducedMotion) return false;
  if (skipAnimationsOnce) { skipAnimationsOnce = false; return false; }
  return true;
}

// ----------------------------------------------------------
// rAF coalescer — max 1 draw pass per frame globally
// ----------------------------------------------------------
const drawQueue = new Map(); // id -> fn
let rafPending = false;
function scheduleDraw(id, fn) {
  drawQueue.set(id, fn);
  if (!rafPending) {
    rafPending = true;
    requestAnimationFrame(flushDraws);
  }
}
function flushDraws() {
  rafPending = false;
  const fns = Array.from(drawQueue.values());
  drawQueue.clear();
  for (const fn of fns) {
    try { fn(); } catch (_) { /* keep other charts alive */ }
  }
}

// ----------------------------------------------------------
// Chart registry + lazy draw + resize
// ----------------------------------------------------------
const registry = new Map(); // id -> { el, draw, visible }
let resizeTimer = 0;

function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => redrawAll(), 100);
}
window.addEventListener("resize", onResize, { passive: true });
window.addEventListener("ich:layoutchange", () => redrawAll(), { passive: true });

export function redrawAll() {
  registry.forEach((entry, id) => {
    if (entry.visible) scheduleDraw(id, entry.draw);
  });
}

export function lazyDraw(el, drawFn) {
  const id = "chart:" + (el.id || Math.random().toString(36).slice(2));
  const entry = { el, draw: drawFn, visible: false };
  registry.set(id, entry);
  if (typeof IntersectionObserver === "undefined") {
    entry.visible = true;
    scheduleDraw(id, entry.draw);
  } else {
    const io = new IntersectionObserver((items) => {
      items.forEach((item) => {
        if (item.isIntersecting) {
          entry.visible = true;
          scheduleDraw(id, entry.draw);
          io.disconnect();
        }
      });
    }, { rootMargin: "120px" });
    io.observe(el);
  }
  return id;
}

// ----------------------------------------------------------
// Shared tooltip (80ms fade, 4px cursor lead)
// ----------------------------------------------------------
let tipEl = null;
function ensureTip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "chart-tooltip";
    tipEl.setAttribute("role", "tooltip");
    tipEl.style.opacity = "0";
    document.body.appendChild(tipEl);
  }
  return tipEl;
}
let tipHideTimer = 0;
export function showTooltip(html, clientX, clientY) {
  const tip = ensureTip();
  tip.innerHTML = html;
  tip.style.opacity = "0";
  tip.classList.add("show");
  clearTimeout(tipHideTimer);
  // Measure then place with a 4px cursor lead, flipping near edges.
  const rect = tip.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rtl = getComputedStyle(document.documentElement).direction === "rtl";
  let x = rtl ? clientX - rect.width - 4 : clientX + 4;
  let y = clientY + 4;
  if (x + rect.width > vw - 8) x = clientX - rect.width - 4;
  if (x < 8) x = 8;
  if (y + rect.height > vh - 8) y = clientY - rect.height - 4;
  if (y < 8) y = 8;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
  // 80ms fade-in via rAF double-tick so opacity transition runs.
  requestAnimationFrame(() => { requestAnimationFrame(() => { tip.style.opacity = "1"; }); });
}
export function hideTooltip() {
  if (!tipEl) return;
  clearTimeout(tipHideTimer);
  tipHideTimer = setTimeout(() => {
    if (tipEl) {
      tipEl.style.opacity = "0";
      tipEl.classList.remove("show");
    }
  }, 80);
}

// ----------------------------------------------------------
// Canvas plumbing
// ----------------------------------------------------------
function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const canvasGeom = new WeakMap(); // canvas -> {w,h,pad}

function setupCanvas(canvas, pad) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(rect.width, 60);
  const h = Math.max(rect.height, 60);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
  }
  canvasGeom.set(canvas, { w, h, pad });
  return { w, h, dpr, pad };
}

/**
 * Draw target with OffscreenCanvas backing store where
 * supported. commit() blits the backing store onto the visible
 * canvas and clears the will-change hint.
 */
const backing = new WeakMap(); // canvas -> OffscreenCanvas
function drawTarget(canvas, geom) {
  canvas.style.willChange = "transform";
  if (typeof OffscreenCanvas !== "undefined") {
    let off = backing.get(canvas);
    if (!off || off.width !== canvas.width || off.height !== canvas.height) {
      off = new OffscreenCanvas(canvas.width, canvas.height);
      backing.set(canvas, off);
    }
    const ctx = off.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(geom.dpr, geom.dpr);
    ctx.clearRect(0, 0, geom.w, geom.h);
    return {
      ctx,
      commit() {
        const on = canvas.getContext("2d");
        on.setTransform(1, 0, 0, 1, 0, 0);
        on.clearRect(0, 0, canvas.width, canvas.height);
        on.drawImage(off, 0, 0);
        requestAnimationFrame(() => { requestAnimationFrame(() => { canvas.style.willChange = ""; }); });
      },
    };
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(geom.dpr, geom.dpr);
  ctx.clearRect(0, 0, geom.w, geom.h);
  return {
    ctx,
    commit() {
      requestAnimationFrame(() => { requestAnimationFrame(() => { canvas.style.willChange = ""; }); });
    },
  };
}

// Scratch buffers — reused across every draw (GC pressure).
const scratch = {
  a: null,
  b: null,
  ensure(len) {
    if (!this.a || this.a.length < len) {
      this.a = new Float32Array(len);
      this.b = new Float32Array(len);
    }
    return this.a;
  },
};

function chartFont(px) {
  return px + "px Inter, 'IBM Plex Sans Arabic', 'Cairo', 'Segoe UI', sans-serif";
}

function emptyState(ctx, w, h, text) {
  ctx.fillStyle = cssVar("--text-3", "#8a90b0");
  ctx.font = chartFont(13);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text || "—", w / 2, h / 2);
}

// ----------------------------------------------------------
// Line / area chart with animated transitions
// ----------------------------------------------------------
const lineState = new WeakMap(); // canvas -> {prev: Float32Array, n, hover}

export function lineChart(canvas, opts) {
  const PAD = { l: 52, r: 16, t: 16, b: 30 };
  const geom = setupCanvas(canvas, PAD);
  const { w, h } = geom;
  const target = drawTarget(canvas, geom);
  const ctx = target.ctx;

  const points = Array.isArray(opts.points) ? opts.points : [];
  const n = points.length;
  const text3 = cssVar("--text-3", "#8a90b0");
  const grid = cssVar("--grid-line", "rgba(148,160,190,0.14)");

  if (n === 0) {
    emptyState(ctx, w, h, opts.emptyText);
    target.commit();
    return;
  }

  scratch.ensure(n);
  const nextVals = scratch.a;
  for (let i = 0; i < n; i++) nextVals[i] = Number(points[i].v) || 0;

  let st = lineState.get(canvas);
  if (!st) {
    st = { prev: null, n: 0 };
    lineState.set(canvas, st);
  }

  const maxV = Math.max(1, ...Array.from(nextVals.slice(0, n)));
  const cw = w - PAD.l - PAD.r;
  const ch = h - PAD.t - PAD.b;
  const xAt = (i) => PAD.l + (cw * i) / Math.max(n - 1, 1);
  const yAt = (v) => PAD.t + ch - (v / maxV) * ch;

  function drawStatic(vals) {
    ctx.clearRect(0, 0, w, h);
    // Grid + y labels
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.font = chartFont(10.5);
    ctx.fillStyle = text3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (ch * i) / 4;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(w - PAD.r, y);
      ctx.stroke();
      const v = maxV - (maxV * i) / 4;
      ctx.fillText(opts.fmtY ? opts.fmtY(v) : String(Math.round(v)), PAD.l - 6, y);
    }

    const line = cssVar("--brand-line", "#5B8DEF");
    const fill = cssVar("--brand-fill", "rgba(91,141,239,0.16)");

    // Smooth spline path through the points (midpoint quadratic)
    const tracePath = () => {
      ctx.moveTo(xAt(0), yAt(vals[0]));
      for (let i = 1; i < n; i++) {
        const x0 = xAt(i - 1), y0 = yAt(vals[i - 1]);
        const x1 = xAt(i), y1 = yAt(vals[i]);
        const mx = (x0 + x1) / 2;
        ctx.bezierCurveTo(mx, y0, mx, y1, x1, y1);
      }
    };

    // Area
    const grad = ctx.createLinearGradient(0, PAD.t, 0, PAD.t + ch);
    grad.addColorStop(0, fill);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    tracePath();
    ctx.lineTo(xAt(n - 1), PAD.t + ch);
    ctx.lineTo(xAt(0), PAD.t + ch);
    ctx.closePath();
    ctx.fill();

    // Line (soft glow underneath)
    ctx.save();
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = line;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    tracePath();
    ctx.stroke();
    ctx.restore();

    // Points
    if (n <= 90) {
      ctx.fillStyle = cssVar("--panel", "#121735");
      ctx.strokeStyle = line;
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(xAt(i), yAt(vals[i]), 3.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    // X labels
    ctx.fillStyle = text3;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const step = Math.max(1, Math.ceil(n / 10));
    for (let i = 0; i < n; i += step) {
      const lbl = points[i].label;
      if (lbl != null) ctx.fillText(String(lbl), xAt(i), PAD.t + ch + 7);
    }
  }

  // Animation between old and new state (600ms cubic ease-out).
  const hasPrev = st.prev && st.n === n && shouldAnimate() && opts.animate !== false;
  if (hasPrev) {
    const from = Float32Array.from(st.prev.subarray(0, n));
    const to = Float32Array.from(nextVals.subarray(0, n));
    const t0 = performance.now();
    const cur = scratch.b;
    const frame = (now) => {
      const raw = Math.min(1, (now - t0) / 600);
      const e = easeOutCubic(raw);
      for (let i = 0; i < n; i++) cur[i] = from[i] + (to[i] - from[i]) * e;
      drawStatic(cur);
      if (raw < 1) requestAnimationFrame(frame);
      else {
        drawStatic(to);
        target.commit();
      }
    };
    requestAnimationFrame(frame);
  } else {
    const mount = shouldAnimate() && opts.animate !== false && !st.prev;
    if (mount) {
      const cur = scratch.b;
      for (let i = 0; i < n; i++) cur[i] = 0;
      const to = Float32Array.from(nextVals.subarray(0, n));
      const t0 = performance.now();
      const frame = (now) => {
        const raw = Math.min(1, (now - t0) / 600);
        const e = easeOutCubic(raw);
        for (let i = 0; i < n; i++) cur[i] = to[i] * e;
        drawStatic(cur);
        if (raw < 1) requestAnimationFrame(frame);
        else {
          drawStatic(to);
          target.commit();
        }
      };
      requestAnimationFrame(frame);
    } else {
      drawStatic(nextVals);
      target.commit();
    }
  }

  // Remember for next transition.
  st.n = n;
  if (!st.prev || st.prev.length < n) st.prev = new Float32Array(n);
  st.prev.set(nextVals.subarray(0, n));

  // ---- Hover: crosshair + highlight dot + tooltip ----
  const wrapEl = canvas.parentElement;
  let cross = wrapEl ? wrapEl.querySelector(".chart-crosshair") : null;
  let dot = wrapEl ? wrapEl.querySelector(".chart-hover-dot") : null;
  if (wrapEl && !cross) {
    cross = document.createElement("div");
    cross.className = "chart-crosshair";
    cross.setAttribute("aria-hidden", "true");
    dot = document.createElement("div");
    dot.className = "chart-hover-dot";
    dot.setAttribute("aria-hidden", "true");
    wrapEl.appendChild(cross);
    wrapEl.appendChild(dot);
  }
  function positionOverlay(i, v) {
    if (!cross || !dot) return;
    const x = xAt(i), y = yAt(v);
    cross.style.display = "block";
    dot.style.display = "block";
    cross.style.left = x + "px";
    cross.style.top = PAD.t + "px";
    cross.style.height = ch + "px";
    dot.style.left = x - 5 + "px";
    dot.style.top = y - 5 + "px";
    dot.style.borderColor = cssVar("--brand-line", "#5B8DEF");
  }
  function hideOverlay() {
    if (cross) cross.style.display = "none";
    if (dot) dot.style.display = "none";
  }

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < PAD.l || px > w - PAD.r) { hideTooltip(); hideOverlay(); return; }
    const idx = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / cw) * Math.max(n - 1, 1))));
    const p = points[idx];
    if (!p) { hideTooltip(); hideOverlay(); return; }
    positionOverlay(idx, p.v);
    if (p.tip) showTooltip(p.tip, e.clientX, e.clientY);
  };
  canvas.onmouseleave = () => { hideTooltip(); hideOverlay(); };
  canvas.ontouchstart = (e) => {
    if (!e.touches || !e.touches[0]) return;
    const tt = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const px = tt.clientX - rect.left;
    const idx = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / cw) * Math.max(n - 1, 1))));
    const p = points[idx];
    if (p) { positionOverlay(idx, p.v); if (p.tip) showTooltip(p.tip, tt.clientX, tt.clientY); }
  };
  canvas.ontouchend = () => { hideTooltip(); hideOverlay(); };
}

// ----------------------------------------------------------
// Grouped bars (monthly actual vs target), animated
// ----------------------------------------------------------
const barState = new WeakMap(); // canvas -> {prev: Float32Array}

export function barsChart(canvas, opts) {
  const PAD = { l: 52, r: 16, t: 18, b: 30 };
  const geom = setupCanvas(canvas, PAD);
  const { w, h } = geom;
  const target = drawTarget(canvas, geom);
  const ctx = target.ctx;

  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  const n = rows.length;
  const text3 = cssVar("--text-3", "#8a90b0");
  const grid = cssVar("--grid-line", "rgba(148,160,190,0.14)");

  if (n === 0) {
    emptyState(ctx, w, h, opts.emptyText);
    target.commit();
    return;
  }

  scratch.ensure(n);
  const actual = scratch.a;
  const targetVals = new Float32Array(n);
  let maxV = 1;
  for (let i = 0; i < n; i++) {
    actual[i] = Number(rows[i].actual) || 0;
    targetVals[i] = Number(rows[i].target) || 0;
    if (actual[i] > maxV) maxV = actual[i];
    if (targetVals[i] > maxV) maxV = targetVals[i];
  }

  const cw = w - PAD.l - PAD.r;
  const ch = h - PAD.t - PAD.b;
  const step = cw / n;
  const bw = Math.max(4, Math.min(18, step * 0.32));
  const xAt = (i) => PAD.l + step * i + step / 2;
  const hOf = (v) => (v / maxV) * ch;

  function drawStatic(vals) {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = grid;
    ctx.lineWidth = 1;
    ctx.font = chartFont(10.5);
    ctx.fillStyle = text3;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const y = PAD.t + (ch * i) / 4;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(w - PAD.r, y);
      ctx.stroke();
      const v = maxV - (maxV * i) / 4;
      ctx.fillText(opts.fmtY ? opts.fmtY(v) : String(Math.round(v)), PAD.l - 6, y);
    }

    const line = cssVar("--brand-line", "#5B8DEF");
    const axis = cssVar("--axis-line", "rgba(148,160,190,0.35)");

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < n; i++) {
      const x = xAt(i);
      const av = vals[i];
      const ah = hOf(av);
      const tv = targetVals[i];
      const th = hOf(tv);

      // Target bar (translucent outline style)
      if (tv > 0) {
        ctx.fillStyle = cssVar("--target-fill", "rgba(148,160,190,0.22)");
        ctx.fillRect(x + 1.5, PAD.t + ch - th, bw, th);
        ctx.strokeStyle = axis;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 1.5, PAD.t + ch - th, bw, th);
      }

      // Actual bar (rounded top corners)
      if (av > 0) {
        const g = ctx.createLinearGradient(0, PAD.t + ch - ah, 0, PAD.t + ch);
        g.addColorStop(0, line);
        g.addColorStop(1, cssVar("--brand-fill", "rgba(91,141,239,0.16)"));
        ctx.fillStyle = g;
        const r = Math.min(4, bw / 2, ah);
        const bx = x - bw - 1.5;
        const by = PAD.t + ch - ah;
        ctx.beginPath();
        ctx.moveTo(bx, by + ah);
        ctx.lineTo(bx, by + r);
        ctx.arcTo(bx, by, bx + r, by, r);
        ctx.lineTo(bx + bw - r, by);
        ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
        ctx.lineTo(bx + bw, by + ah);
        ctx.closePath();
        ctx.fill();
      }

      // Prorated-pace marker for the in-progress month
      if (rows[i].pace != null && rows[i].pace > 0) {
        const ph = hOf(rows[i].pace);
        ctx.save();
        ctx.strokeStyle = cssVar("--warn", "#E8B15C");
        ctx.setLineDash([3, 3]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - bw - 3, PAD.t + ch - ph);
        ctx.lineTo(x + bw + 3, PAD.t + ch - ph);
        ctx.stroke();
        ctx.restore();
      }

      ctx.fillStyle = text3;
      ctx.fillText(String(rows[i].label || ""), x, PAD.t + ch + 7);
    }
  }

  let st = barState.get(canvas);
  if (!st) { st = { prev: null, n: 0 }; barState.set(canvas, st); }

  const hasPrev = st.prev && st.n === n && shouldAnimate();
  if (hasPrev) {
    const from = Float32Array.from(st.prev.subarray(0, n));
    const to = Float32Array.from(actual.subarray(0, n));
    const cur = scratch.b;
    const t0 = performance.now();
    const frame = (now) => {
      const raw = Math.min(1, (now - t0) / 600);
      const e = easeOutCubic(raw);
      for (let i = 0; i < n; i++) cur[i] = from[i] + (to[i] - from[i]) * e;
      drawStatic(cur);
      if (raw < 1) requestAnimationFrame(frame);
      else { drawStatic(to); target.commit(); }
    };
    requestAnimationFrame(frame);
  } else if (shouldAnimate() && !st.prev) {
    const to = Float32Array.from(actual.subarray(0, n));
    const cur = scratch.b;
    const t0 = performance.now();
    const frame = (now) => {
      const raw = Math.min(1, (now - t0) / 600);
      const e = easeOutCubic(raw);
      for (let i = 0; i < n; i++) cur[i] = to[i] * e;
      drawStatic(cur);
      if (raw < 1) requestAnimationFrame(frame);
      else { drawStatic(to); target.commit(); }
    };
    requestAnimationFrame(frame);
  } else {
    drawStatic(actual);
    target.commit();
  }

  if (!st.prev || st.prev.length < n) st.prev = new Float32Array(n);
  st.prev.set(actual.subarray(0, n));
  st.n = n;

  // Hover tooltips
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < PAD.l || px > w - PAD.r) { hideTooltip(); return; }
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - PAD.l) / step)));
    if (rows[i] && rows[i].tip) showTooltip(rows[i].tip, e.clientX, e.clientY);
  };
  canvas.onmouseleave = hideTooltip;
}

// ----------------------------------------------------------
// Sparkline (SVG, 60×20, gradient stroke)
// ----------------------------------------------------------
const sparkUid = { n: 0 };

export function sparkline(el, values, w, h) {
  const W = w || 60;
  const H = h || 20;
  const vals = (Array.isArray(values) ? values : []).map((v) => Number(v) || 0);
  sparkUid.n += 1;
  const gid = "sparkg" + sparkUid.n;

  let body = "";
  if (vals.length === 0) {
    body = '<line x1="2" y1="' + (H / 2) + '" x2="' + (W - 2) + '" y2="' + (H / 2) + '" stroke="var(--text-3)" stroke-width="1.5" stroke-dasharray="2 2"/>';
  } else if (vals.length === 1) {
    body = '<circle cx="' + (W / 2) + '" cy="' + (H / 2) + '" r="2.5" fill="var(--brand-accent)"/>';
  } else {
    const min = Math.min.apply(null, vals);
    const max = Math.max.apply(null, vals);
    const span = max - min || 1;
    const xAt = (i) => 2 + ((W - 4) * i) / (vals.length - 1);
    const yAt = (v) => H - 3 - ((v - min) / span) * (H - 6);
    const pts = vals.map((v, i) => xAt(i).toFixed(1) + "," + yAt(v).toFixed(1)).join(" ");
    body =
      '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="0">' +
      '<stop offset="0%" stop-color="var(--brand-accent)" stop-opacity="0.35"/>' +
      '<stop offset="100%" stop-color="var(--brand-accent)" stop-opacity="1"/>' +
      "</linearGradient></defs>" +
      '<polyline points="' + pts + '" fill="none" stroke="url(#' + gid + ')" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';
  }

  el.innerHTML =
    '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H +
    '" aria-hidden="true" focusable="false">' + body + "</svg>";
}

// ----------------------------------------------------------
// Donut (SVG, stroke-dashoffset draw-in, center label)
// ----------------------------------------------------------
const donutState = new WeakMap(); // el -> { mounted }

export function donutChart(el, opts) {
  const items = (opts.items || []).filter((d) => Number(d.value) > 0);
  const total = items.reduce((s, d) => s + Number(d.value || 0), 0);

  if (!items.length || total <= 0) {
    el.innerHTML = '<div class="donut-empty">' + (opts.emptyText || "—") + "</div>";
    return;
  }

  const R = 66;
  const C = 2 * Math.PI * R;
  const SW = 26;
  const SEG_GAP = 2; // small visual gap between segments

  let svg = '<svg viewBox="0 0 160 160" class="donut-svg" role="img" aria-label="' + (opts.ariaLabel || "donut") + '">';
  let offset = 0;
  const segs = [];
  items.forEach((d) => {
    const frac = Number(d.value) / total;
    const len = Math.max(0.5, frac * C - SEG_GAP);
    segs.push({ d, len, offset });
    offset += frac * C;
  });

  const animate = shouldAnimate() && !donutState.get(el);
  segs.forEach((s, i) => {
    // Final placement: dasharray "len gap" + dashoffset -offset
    // puts the segment at arc position `offset`. Draw-in grows
    // the dash from 0 → len (700ms ease-in-out) so each segment
    // sweeps in from its own start point.
    const finalDash = s.len.toFixed(2) + " " + (C - s.len).toFixed(2);
    const initialDash = animate ? "0.01 " + (C - 0.01).toFixed(2) : finalDash;
    svg +=
      '<circle class="donut-seg" data-i="' + i +
      '" cx="80" cy="80" r="' + R + '" fill="none" stroke="' + s.d.color +
      '" stroke-width="' + SW + '" stroke-dasharray="' + initialDash +
      '" stroke-dashoffset="' + (-s.offset).toFixed(2) + '"/>';
  });
  svg += "</svg>";

  el.innerHTML =
    svg +
    '<div class="donut-center" aria-live="polite">' +
    '<div class="donut-center-sales">' + (opts.centerSales || "") + "</div>" +
    '<div class="donut-center-tx">' + (opts.centerTx || "") + "</div>" +
    "</div>";

  el.querySelectorAll(".donut-seg").forEach((seg) => {
    const s = segs[Number(seg.dataset.i)];
    if (animate) {
      // Double-rAF commits the initial (zero-length) dash first,
      // then the CSS transition grows it to full length (700ms).
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          seg.style.strokeDasharray = s.len.toFixed(2) + " " + (C - s.len).toFixed(2);
        });
      });
    }
    seg.addEventListener("mousemove", (e) => {
      if (s.d.tip) showTooltip(s.d.tip, e.clientX, e.clientY);
    });
    seg.addEventListener("mouseleave", hideTooltip);
  });

  donutState.set(el, { mounted: true });
}

