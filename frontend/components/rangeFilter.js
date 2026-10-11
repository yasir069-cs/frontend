/* =============================================================
   components/rangeFilter.js  (v3)
   Period presets: Today / Last 15 Days / Last 1 Month / Custom,
   with native date inputs for the custom range. RTL-aware.
   ============================================================= */

"use strict";

export function createRangeFilter(wrap, opts) {
  const o = opts || {};
  const chips = Array.from(wrap.querySelectorAll("[data-preset]"));
  const fromInput = wrap.querySelector('input[type="date"][data-range="from"]');
  const toInput = wrap.querySelector('input[type="date"][data-range="to"]');
  const customWrap = wrap.querySelector("[data-custom-wrap]");

  const state = { preset: "month", from: null, to: null };

  function iso(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function syncUI() {
    chips.forEach((c) => c.classList.toggle("active", c.dataset.preset === state.preset));
    if (customWrap) customWrap.hidden = state.preset !== "custom";
  }

  function emit() {
    if (o.onChange) o.onChange({ preset: state.preset, from: state.from, to: state.to });
  }

  function applyPreset(preset) {
    state.preset = preset;
    const now = new Date();
    if (preset === "today") {
      state.from = iso(now);
      state.to = iso(now);
    } else if (preset === "15") {
      const start = new Date(now);
      start.setDate(now.getDate() - 14);
      state.from = iso(start);
      state.to = iso(now);
    } else if (preset === "30") {
      const start = new Date(now);
      start.setDate(now.getDate() - 29);
      state.from = iso(start);
      state.to = iso(now);
    } else if (preset === "month") {
      state.from = null;
      state.to = null;
    }
    syncUI();
    emit();
  }

  chips.forEach((chip) => {
    chip.addEventListener("click", () => applyPreset(chip.dataset.preset));
  });

  if (fromInput) {
    fromInput.addEventListener("change", () => {
      state.preset = "custom";
      state.from = fromInput.value || null;
      if (state.from && state.to) { syncUI(); emit(); }
      else syncUI();
    });
  }
  if (toInput) {
    toInput.addEventListener("change", () => {
      state.preset = "custom";
      state.to = toInput.value || null;
      if (state.from && state.to) { syncUI(); emit(); }
      else syncUI();
    });
  }

  syncUI();

  return {
    setPreset: applyPreset,
    getPreset: () => state.preset,
    getRange: () => ({ from: state.from, to: state.to }),
  };
}
