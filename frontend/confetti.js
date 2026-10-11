/* =============================================================
   confetti.js  (v3)
   Micro-celebration: 60 particles, 1.2s, theme-aware colors,
   auto-cleanup. Skipped entirely for reduced-motion users.
   ============================================================= */

"use strict";

let reducedMotion = false;
try {
  reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
} catch (_) { /* ignore */ }

const MAX_LIVE = 2;
let live = 0;

/**
 * Fire a burst at viewport coordinates (clientX/clientY).
 * `colors` is an array of hex/rgba strings from the active theme.
 */
export function burstAt(clientX, clientY, colors) {
  if (reducedMotion) return;
  if (live >= MAX_LIVE) return;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const palette = (colors && colors.length ? colors : ["#C9A24B", "#7C3AED", "#14B8A6"]).slice();
  const N = 60;
  const parts = [];
  for (let i = 0; i < N; i++) {
    const ang = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
    const speed = 4 + Math.random() * 6;
    parts.push({
      x: clientX,
      y: clientY,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      size: 3 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      color: palette[i % palette.length],
      shape: i % 3,
    });
  }

  const T0 = performance.now();
  const LIFE = 1200;
  live += 1;

  function frame(now) {
    const t = now - T0;
    ctx.clearRect(0, 0, vw, vh);
    const fade = t >= LIFE * 0.7 ? Math.max(0, 1 - (t - LIFE * 0.7) / (LIFE * 0.3)) : 1;
    for (let i = 0; i < N; i++) {
      const p = parts[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18; // gravity
      p.vx *= 0.985;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 0) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      else if (p.shape === 1) {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -p.size / 2);
        ctx.lineTo(p.size / 2, p.size / 2);
        ctx.lineTo(-p.size / 2, p.size / 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    if (t < LIFE) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
      live = Math.max(0, live - 1);
    }
  }
  requestAnimationFrame(frame);
}
