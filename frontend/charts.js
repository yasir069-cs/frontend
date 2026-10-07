/* =============================================================
   charts.js
   Themed chart helpers (line/area, bar, donut) drawn on Canvas.
   - All colors come from CSS variables so a theme change
     re-themes the next render without touching the canvas state.
   - Tooltips via a floating div positioned over the chart.
   - Auto-resize on the "ich:layoutchange" event and on a
     ResizeObserver attached to the parent.
   - Downsamples very large datasets and skips per-point
     animation when the point count is over ANIM_LIMIT.
   ============================================================= */

(function (global) {
  "use strict";

  const ANIM_LIMIT = 90; // over this, skip per-point draw animation
  const DOWNSAMPLE_MAX = 180;

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function readThemeColors() {
    return {
      line: cssVar("--brand-line") || "#1E40C8",
      fill: cssVar("--brand-fill") || "rgba(30, 64, 200, 0.18)",
      palette: [
        cssVar("--brand-palette-0"),
        cssVar("--brand-palette-1"),
        cssVar("--brand-palette-2"),
        cssVar("--brand-palette-3"),
        cssVar("--brand-palette-4"),
        cssVar("--brand-palette-5"),
      ].filter(Boolean),
      text: cssVar("--text-2") || "#A0A6C7",
      grid: "rgba(255,255,255,0.06)",
      axis: "rgba(255,255,255,0.18)",
    };
  }

  function setupCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(rect.width, 50);
    const h = Math.max(rect.height, 50);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function downsample(arr, max) {
    if (arr.length <= max) return arr;
    const step = arr.length / max;
    const out = [];
    for (let i = 0; i < max; i++) {
      out.push(arr[Math.floor(i * step)]);
    }
    return out;
  }

  function fmtKD(v) {
    const n = Number(v) || 0;
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k";
    return n.toFixed(0);
  }

  /** Attach a tooltip element to a chart-wrap. */
  function ensureTooltip(wrap) {
    let tip = wrap.querySelector(".chart-tooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "chart-tooltip";
      wrap.appendChild(tip);
    }
    return tip;
  }
  function showTip(tip, html, x, y) {
    tip.innerHTML = html;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
    tip.classList.add("show");
  }
  function hideTip(tip) { tip.classList.remove("show"); }

  // ----------------------------------------------------------
  // Line/area chart with gradient fill + hover tooltip
  // ----------------------------------------------------------
  function line(canvas, opts) {
    const { ctx, w, h } = setupCanvas(canvas);
    const colors = readThemeColors();
    const data = Array.isArray(opts.series) ? opts.series : [];
    const labels = opts.labels || [];
    const padded = data.map((v) => (v == null || isNaN(v) ? null : Number(v)));
    const numeric = padded.filter((v) => v != null);
    if (numeric.length === 0) {
      ctx.fillStyle = colors.text;
      ctx.font = "13px Inter, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(opts.empty || "No data", w / 2, h / 2);
      return;
    }
    const max = Math.max(...numeric, 1);
    const p = { l: 50, r: 18, t: 18, b: 32 };
    const cw = w - p.l - p.r;
    const ch = h - p.t - p.b;

    // Grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = p.t + (ch * i) / 4;
      ctx.beginPath();
      ctx.moveTo(p.l, y);
      ctx.lineTo(w - p.r, y);
      ctx.stroke();
    }
    // Y axis labels
    ctx.fillStyle = colors.text;
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = max - (max * i) / 4;
      const y = p.t + (ch * i) / 4;
      ctx.fillText(fmtKD(v), p.l - 6, y);
    }

    const n = padded.length;
    if (n === 0) return;
    const xAt = (i) => p.l + (cw * i) / Math.max(n - 1, 1);
    const yAt = (v) => p.t + ch - (v / max) * ch;

    // Area gradient
    let grad = ctx.createLinearGradient(0, p.t, 0, p.t + ch);
    grad.addColorStop(0, colors.fill);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    let started = false;
    padded.forEach((v, i) => {
      if (v == null) return;
      const x = xAt(i), y = yAt(v);
      if (!started) { ctx.moveTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    });
    // close to bottom
    if (started) {
      // find last valid index
      let lastIdx = padded.length - 1;
      while (lastIdx >= 0 && padded[lastIdx] == null) lastIdx--;
      ctx.lineTo(xAt(lastIdx), p.t + ch);
      let firstIdx = padded.findIndex((v) => v != null);
      ctx.lineTo(xAt(firstIdx), p.t + ch);
      ctx.closePath();
      ctx.fill();
    }

    // Line
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    let pen = false;
    padded.forEach((v, i) => {
      if (v == null) return;
      const x = xAt(i), y = yAt(v);
      if (!pen) { ctx.moveTo(x, y); pen = true; }
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Points (skip if too many)
    if (n <= ANIM_LIMIT) {
      ctx.fillStyle = colors.line;
      padded.forEach((v, i) => {
        if (v == null) return;
        const x = xAt(i), y = yAt(v);
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // X axis labels
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "10.5px Inter, sans-serif";
    const step = Math.max(1, Math.floor(n / 8));
    padded.forEach((_, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const lbl = labels[i] || (i + 1);
      ctx.fillText(String(lbl), xAt(i), p.t + ch + 6);
    });

    // Hover tooltip
    const wrap = canvas.parentElement;
    const tip = ensureTooltip(wrap);
    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (px < p.l || px > w - p.r) { hideTip(tip); return; }
      const idx = Math.round(((px - p.l) / cw) * (n - 1));
      const v = padded[idx];
      if (v == null) { hideTip(tip); return; }
      const lbl = labels[idx] || (idx + 1);
      showTip(
        tip,
        '<div class="row"><span>Day</span><b>' + lbl + '</b></div>' +
        '<div class="row"><span>Sales</span><b>' + (Number(v).toLocaleString("en-US", { maximumFractionDigits: 2 })) + ' KD</b></div>',
        xAt(idx), yAt(v)
      );
    }
    function onLeave() { hideTip(tip); }
    canvas.onmousemove = onMove;
    canvas.onmouseleave = onLeave;
    canvas.ontouchstart = function (e) {
      if (!e.touches || !e.touches[0]) return;
      onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    };
    canvas.ontouchmove = function (e) {
      if (!e.touches || !e.touches[0]) return;
      onMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    };
    canvas.ontouchend = onLeave;
  }

  // ----------------------------------------------------------
  // Grouped bar chart: actual + target per month
  // ----------------------------------------------------------
  function groupedBars(canvas, opts) {
    const { ctx, w, h } = setupCanvas(canvas);
    const colors = readThemeColors();
    const labels = opts.labels || [];
    const a = (opts.actual || []).map(Number);
    const t = (opts.target || []).map(Number);
    const max = Math.max(1, ...a, ...t);
    const p = { l: 50, r: 18, t: 26, b: 36 };
    const cw = w - p.l - p.r;
    const ch = h - p.t - p.b;

    // grid
    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = p.t + (ch * i) / 4;
      ctx.beginPath();
      ctx.moveTo(p.l, y);
      ctx.lineTo(w - p.r, y);
      ctx.stroke();
    }
    ctx.fillStyle = colors.text;
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = max - (max * i) / 4;
      const y = p.t + (ch * i) / 4;
      ctx.fillText(fmtKD(v), p.l - 6, y);
    }

    const n = a.length || 1;
    const step = cw / n;
    const bw = Math.max(4, step * 0.32);
    ctx.font = "10.5px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    a.forEach((v, i) => {
      const x = p.l + step * i + step / 2;
      const ah = (v / max) * ch;
      const th = (t[i] || 0 / max) * ch;
      // actual bar
      let g = ctx.createLinearGradient(0, p.t + ch - ah, 0, p.t + ch);
      g.addColorStop(0, colors.palette[0] || colors.line);
      g.addColorStop(1, colors.palette[1] || colors.line);
      ctx.fillStyle = g;
      roundRect(ctx, x - bw - 2, p.t + ch - ah, bw, ah, 4);
      ctx.fill();
      // target bar (outline)
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      roundRect(ctx, x + 2, p.t + ch - th, bw, th, 4);
      ctx.fill();
      // month label
      ctx.fillStyle = colors.text;
      ctx.fillText((labels[i] || "").slice(0, 3), x, p.t + ch + 6);
    });

    // Legend
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const lx = w - 160, ly = 16;
    ctx.fillStyle = colors.palette[0] || colors.line;
    roundRect(ctx, lx, ly - 6, 12, 12, 2); ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.fillText("Actual", lx + 18, ly);
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    roundRect(ctx, lx + 70, ly - 6, 12, 12, 2); ctx.fill();
    ctx.fillStyle = colors.text;
    ctx.fillText("Target", lx + 88, ly);
  }

  // ----------------------------------------------------------
  // Multi-series line chart: per-branch daily sales
  // ----------------------------------------------------------
  function multiLine(canvas, opts) {
    const { ctx, w, h } = setupCanvas(canvas);
    const colors = readThemeColors();
    const series = opts.series || []; // [{name, color, data:[]}]
    const labels = opts.labels || [];
    if (series.length === 0 || series.every((s) => s.data.every((v) => v == null || v === 0))) {
      ctx.fillStyle = colors.text;
      ctx.font = "13px Inter, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No per-branch data for this period", w / 2, h / 2);
      return;
    }
    const allVals = series.flatMap((s) => s.data.filter((v) => v != null).map(Number));
    const max = Math.max(1, ...allVals);
    const p = { l: 50, r: 18, t: 18, b: 32 };
    const cw = w - p.l - p.r;
    const ch = h - p.t - p.b;

    ctx.strokeStyle = colors.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = p.t + (ch * i) / 4;
      ctx.beginPath();
      ctx.moveTo(p.l, y);
      ctx.lineTo(w - p.r, y);
      ctx.stroke();
    }
    ctx.fillStyle = colors.text;
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let i = 0; i <= 4; i++) {
      const v = max - (max * i) / 4;
      const y = p.t + (ch * i) / 4;
      ctx.fillText(fmtKD(v), p.l - 6, y);
    }

    const n = (series[0] && series[0].data.length) || 1;
    const xAt = (i) => p.l + (cw * i) / Math.max(n - 1, 1);
    const yAt = (v) => p.t + ch - (v / max) * ch;

    series.forEach((s) => {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      let pen = false;
      s.data.forEach((v, i) => {
        if (v == null) return;
        const x = xAt(i), y = yAt(v);
        if (!pen) { ctx.moveTo(x, y); pen = true; }
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    // x labels
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "10.5px Inter, sans-serif";
    const step = Math.max(1, Math.floor(n / 8));
    for (let i = 0; i < n; i++) {
      if (i % step !== 0 && i !== n - 1) continue;
      ctx.fillText(String(labels[i] || (i + 1)), xAt(i), p.t + ch + 6);
    }

    // Legend
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let lx = p.l, ly = 14;
    series.forEach((s) => {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly - 4, 10, 10);
      ctx.fillStyle = colors.text;
      const name = s.name;
      ctx.fillText(name, lx + 14, ly);
      lx += 14 + ctx.measureText(name).width + 16;
    });
  }

  // ----------------------------------------------------------
  // Donut for revenue source breakdown
  // ----------------------------------------------------------
  function donut(canvas, opts) {
    const { ctx, w, h } = setupCanvas(canvas);
    const colors = readThemeColors();
    const data = (opts.data || []).filter((d) => Number(d.value) > 0);
    if (data.length === 0) {
      ctx.fillStyle = colors.text;
      ctx.font = "13px Inter, Segoe UI, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No revenue source data", w / 2, h / 2);
      return;
    }
    const total = data.reduce((s, d) => s + Number(d.value || 0), 0) || 1;
    const cx = w * 0.35;
    const cy = h / 2;
    const r = Math.min(w * 0.30, h * 0.40);
    const inner = r * 0.62;

    let a0 = -Math.PI / 2;
    data.forEach((d, i) => {
      const slice = (Number(d.value) / total) * Math.PI * 2;
      const a1 = a0 + slice;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = d.color || colors.palette[i % colors.palette.length];
      ctx.fill();
      a0 = a1;
    });
    // inner hole
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // center label
    ctx.fillStyle = colors.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText("Total", cx, cy - 12);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "700 16px Inter, sans-serif";
    ctx.fillText(fmtKD(total) + " KD", cx, cy + 8);

    // legend on the right
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let ly = cy - data.length * 12;
    data.forEach((d) => {
      ctx.fillStyle = d.color || colors.palette[0];
      ctx.fillRect(w * 0.62, ly - 5, 10, 10);
      ctx.fillStyle = colors.text;
      const pct = ((Number(d.value) / total) * 100).toFixed(1) + "%";
      ctx.fillText(d.label + "  " + pct, w * 0.62 + 16, ly);
      ly += 26;
    });
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  function roundRect(ctx, x, y, w, h, r) {
    if (w < 2 * r) r = w / 2;
    if (h < 2 * r) r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /** Auto-resize a chart when its container resizes. */
  function autoResize(drawFn) {
    const wrap = this;
    let raf = 0;
    function redraw() {
      raf = 0;
      drawFn();
    }
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(() => { if (!raf) raf = requestAnimationFrame(redraw); });
      ro.observe(wrap);
    }
    window.addEventListener("ich:layoutchange", () => { if (!raf) raf = requestAnimationFrame(redraw); });
  }

  global.ICH = global.ICH || {};
  global.ICH.charts = { line, groupedBars, multiLine, donut, autoResize, downsample, readThemeColors };
})(window);
