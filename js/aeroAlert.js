import { h } from "./utils.js";

const ICON = '<svg viewBox="0 0 48 48" aria-hidden="true">'
  + '<defs><linearGradient id="aeroW" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6b8"/><stop offset=".55" stop-color="#ffd43b"/><stop offset="1" stop-color="#e49a00"/></linearGradient></defs>'
  + '<path d="M24 4.5 45 41a2.4 2.4 0 0 1-2.1 3.6H5.1A2.4 2.4 0 0 1 3 41z" fill="url(#aeroW)" stroke="#8a5a00" stroke-width="1.6" stroke-linejoin="round"/>'
  + '<path d="M24 8 40 36H8z" fill="#fff" fill-opacity=".22" stroke="none"/>'
  + '<rect x="21.6" y="17" width="4.8" height="15" rx="2.2" fill="#3a2a00" stroke="none"/>'
  + '<circle cx="24" cy="37" r="2.8" fill="#3a2a00" stroke="none"/></svg>';

let current = null;

export function aeroAlert({ title = "Pik", heading = "", text = "" } = {}) {
  current?.(true);
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const x = h("button", { class: "aero-x", type: "button", "aria-label": "Закрыть", title: "Закрыть", tabindex: "-1" });
    const ok = h("button", { class: "btn aero-ok", type: "button", text: "Закрыть" });
    const ico = h("span", { class: "aero-ico" });
    ico.innerHTML = ICON;
    const cap = h("div", { class: "aero-cap" }, h("span", { class: "aero-title", text: title }), x);
    const body = h("div", { class: "aero-body" },
      h("div", { class: "aero-main" }, ico,
        h("div", { class: "aero-msg" },
          h("div", { class: "aero-head", text: heading }),
          text ? h("div", { class: "aero-text", text }) : null)),
      h("div", { class: "aero-foot" }, ok));
    const win = h("div", { class: "aero-win", role: "alertdialog", "aria-modal": "true", "aria-label": heading || title }, cap, body);
    const ov = h("div", { class: "aero-ov" }, win);

    let closing = false;
    const finish = () => {
      ov.remove();
      document.removeEventListener("keydown", onKey, true);
      if (current === close) current = null;
      try { prevFocus?.focus?.(); } catch {}
      resolve();
    };
    const close = (instant) => {
      if (closing) return;
      closing = true;
      if (instant === true) { finish(); return; }
      ov.classList.add("closing");
      setTimeout(finish, 170);
    };
    current = close;

    function onKey(e) {
      if (e.key === "Escape" || e.key === "Enter" || e.key === "Tab") {
        e.preventDefault(); e.stopImmediatePropagation();
        if (e.key === "Tab") ok.focus(); else close();
      }
    }
    document.addEventListener("keydown", onKey, true);

    x.onclick = ok.onclick = () => close();
    ov.addEventListener("mousedown", (e) => {
      if (e.target !== ov) return;
      win.classList.remove("flash"); void win.offsetWidth; win.classList.add("flash");
    });

    cap.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".aero-x")) return;
      const sx = e.clientX - (parseFloat(win.style.left) || 0), sy = e.clientY - (parseFloat(win.style.top) || 0);
      cap.setPointerCapture(e.pointerId);
      const move = (m) => { win.style.left = m.clientX - sx + "px"; win.style.top = m.clientY - sy + "px"; };
      const up = () => { cap.removeEventListener("pointermove", move); cap.removeEventListener("pointerup", up); };
      cap.addEventListener("pointermove", move);
      cap.addEventListener("pointerup", up);
    });

    document.body.append(ov);
    ok.focus();
  });
}
