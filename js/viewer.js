import { h } from "./utils.js";

export function openViewer(src) {
  const v = h("div", { class: "modal viewer", onclick: () => v.remove() }, h("img", { src, alt: "" }));
  document.body.append(v);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") document.querySelector(".viewer")?.remove();
});
