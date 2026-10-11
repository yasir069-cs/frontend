/* =============================================================
   components/listbox.js  (v3)
   Custom accessible listbox — replaces every native <select>.
     - button[role=combobox] + ul[role=listbox] popup
     - Full keyboard support: arrows / Home / End / Enter / Space
       / Esc, with aria-activedescendant focus mirroring
     - Click-outside closes; popup flips up when space is tight
     - Optional color dot + badge per option
   ============================================================= */

"use strict";

let uid = 0;

export function createListbox(button, opts) {
  const o = opts || {};
  let options = o.options || [];
  let value = o.value != null ? o.value : (options[0] && options[0].value);
  let open = false;
  let activeIndex = -1;

  const idBase = "lb" + (++uid) + "-";
  button.setAttribute("role", "combobox");
  button.setAttribute("aria-haspopup", "listbox");
  button.setAttribute("aria-expanded", "false");
  button.type = "button";

  const labelSpan = button.querySelector(".lb-label") || document.createElement("span");
  labelSpan.className = "lb-label";
  let chev = button.querySelector(".lb-chev");
  if (!chev) {
    chev = document.createElement("span");
    chev.className = "lb-chev";
    chev.setAttribute("aria-hidden", "true");
    chev.textContent = "▾";
  }
  if (!button.contains(labelSpan) || !button.contains(chev)) {
    while (button.firstChild) button.removeChild(button.firstChild);
    button.appendChild(labelSpan);
    button.appendChild(chev);
  }

  const popup = document.createElement("ul");
  popup.className = "lb-popup";
  popup.setAttribute("role", "listbox");
  popup.setAttribute("aria-labelledby", button.id || idBase + "btn");
  popup.id = idBase + "popup";
  popup.hidden = true;
  // Anchor to <body>: ancestors with `contain: paint` (filters
  // row) would otherwise clip a fixed-position popup.
  document.body.appendChild(popup);
  button.setAttribute("aria-controls", popup.id);

  function renderOptions() {
    popup.innerHTML = "";
    options.forEach((op, i) => {
      const li = document.createElement("li");
      li.id = idBase + "opt" + i;
      li.setAttribute("role", "option");
      li.tabIndex = -1;
      li.dataset.value = String(op.value);
      if (op.disabled) li.setAttribute("aria-disabled", "true");
      if (op.value === value) li.setAttribute("aria-selected", "true");
      let inner = "";
      if (op.dot) inner += '<span class="lb-dot" aria-hidden="true" style="background:' + op.dot + '"></span>';
      inner += '<span class="lb-text">' + op.label + "</span>";
      if (op.badge) inner += '<span class="lb-badge">' + op.badge + "</span>";
      li.innerHTML = inner;
      popup.appendChild(li);
    });
  }

  function selectedOption() {
    return options.find((x) => x.value === value) || options[0] || null;
  }

  function renderButton() {
    const sel = selectedOption();
    labelSpan.innerHTML = "";
    if (sel) {
      if (sel.dot) {
        const d = document.createElement("span");
        d.className = "lb-dot";
        d.setAttribute("aria-hidden", "true");
        d.style.background = sel.dot;
        labelSpan.appendChild(d);
      }
      const t = document.createElement("span");
      t.textContent = sel.label;
      labelSpan.appendChild(t);
      if (sel.badge) {
        const b = document.createElement("span");
        b.className = "lb-badge";
        b.textContent = sel.badge;
        labelSpan.appendChild(b);
      }
    } else {
      labelSpan.textContent = o.placeholder || "—";
    }
    if (o.onAriaLabel) button.setAttribute("aria-label", o.onAriaLabel(sel));
  }

  function place() {
    const rect = button.getBoundingClientRect();
    popup.style.minWidth = rect.width + "px";
    popup.style.top = "";
    popup.style.bottom = "";
    // Flip up when there is more room above than below.
    const spaceBelow = window.innerHeight - rect.bottom;
    const popH = popup.offsetHeight || 220;
    popup.style.left = rect.left + "px";
    if (spaceBelow < popH + 12 && rect.top > popH + 12) {
      popup.style.bottom = (window.innerHeight - rect.top + 6) + "px";
    } else {
      popup.style.top = (rect.bottom + 6) + "px";
    }
  }

  function setActive(i, scroll) {
    activeIndex = i;
    const items = popup.querySelectorAll('[role="option"]');
    items.forEach((li, k) => {
      li.classList.toggle("active", k === i);
      if (k === i) {
        button.setAttribute("aria-activedescendant", li.id);
        if (scroll) li.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function openPopup() {
    if (open) return;
    open = true;
    popup.hidden = false;
    button.setAttribute("aria-expanded", "true");
    const selIdx = Math.max(0, options.findIndex((x) => x.value === value));
    setActive(selIdx, true);
    place();
    document.addEventListener("pointerdown", onDocPointer, true);
    document.addEventListener("keydown", onDocKey, true);
    window.addEventListener("resize", onWinResize, { passive: true });
    // Scrolling moves the anchor — dismiss instead of drifting.
    window.addEventListener("scroll", closePopup, { passive: true, capture: true });
  }

  function closePopup() {
    if (!open) return;
    open = false;
    popup.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.removeAttribute("aria-activedescendant");
    document.removeEventListener("pointerdown", onDocPointer, true);
    document.removeEventListener("keydown", onDocKey, true);
    window.removeEventListener("resize", onWinResize);
    window.removeEventListener("scroll", closePopup, { capture: true });
  }

  function choose(i) {
    const op = options[i];
    if (!op || op.disabled) return;
    const changed = op.value !== value;
    value = op.value;
    renderButton();
    renderOptions();
    closePopup();
    if (changed && o.onChange) o.onChange(value, op);
  }

  function onDocPointer(e) {
    if (!popup.contains(e.target) && !button.contains(e.target)) closePopup();
  }
  function onDocKey(e) {
    if (e.key === "Escape") closePopup();
  }
  function onWinResize() { if (open) place(); }

  button.addEventListener("click", () => {
    if (open) closePopup();
    else openPopup();
  });

  button.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
    }
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPopup();
        return;
      }
      return;
    }
    if (e.key === "Escape") { closePopup(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      let i = activeIndex + dir;
      while (i >= 0 && i < options.length && options[i].disabled) i += dir;
      if (i >= 0 && i < options.length) setActive(i, true);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0, true);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1, true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(activeIndex);
    }
  });

  popup.addEventListener("click", (e) => {
    const li = e.target.closest('[role="option"]');
    if (!li) return;
    const i = Array.prototype.indexOf.call(popup.children, li);
    choose(i);
  });

  renderOptions();
  renderButton();

  return {
    el: button,
    open: openPopup,
    close: closePopup,
    toggle: () => (open ? closePopup() : openPopup()),
    isOpen: () => open,
    getValue: () => value,
    setValue(v, silent) {
      value = v;
      renderButton();
      renderOptions();
      if (!silent && o.onChange) o.onChange(value, selectedOption());
    },
    setOptions(list, keepValue) {
      options = list || [];
      if (!keepValue || !options.some((x) => x.value === value)) {
        value = options.length ? options[0].value : null;
      }
      renderOptions();
      renderButton();
    },
    focus: () => button.focus(),
    destroy() {
      closePopup();
      popup.remove();
    },
  };
}
