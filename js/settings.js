import { $, h } from "./utils.js";

const KEY = "pik.settings";
const DEF = { font: 13, wall: "blue", glass: "blue", width: 1000, compact: false, anim: true, time: true, says: true, send: "enter" };
let S = { ...DEF };
try { S = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

function apply() {
  const r = document.documentElement, set = (k, v) => v ? r.setAttribute("data-" + k, v) : r.removeAttribute("data-" + k);
  r.style.setProperty("--fs", S.font + "px");
  r.style.setProperty("--pw", S.width ? S.width + "px" : "none");
  set("wall", S.wall !== "blue" && S.wall);
  set("glass", S.glass !== "blue" && S.glass);
  set("compact", S.compact && "on");
  set("anim", !S.anim && "off");
  set("time", !S.time && "off");
  set("says", !S.says && "off");
}
apply();

document.addEventListener("keydown", (e) => {
  if (S.send !== "ctrl" || e.key !== "Enter" || e.target.tagName !== "TEXTAREA" || !e.target.closest(".composer")) return;
  e.stopImmediatePropagation();
  if (e.ctrlKey || e.metaKey) { e.preventDefault(); $(".composer-bar .btn")?.click(); }
}, true);

const WALLS = [["blue", "Aero синий"], ["green", "Зелёный"], ["violet", "Фиолетовый"], ["graphite", "Графит"], ["red", "Красный"]];
const GLASS = [["blue", "Синее"], ["green", "Зелёное"], ["violet", "Фиолетовое"], ["graphite", "Серое"]];
const WIDTHS = [[800, "Узкая (800 px)"], [1000, "Обычная (1000 px)"], [1300, "Широкая (1300 px)"], [0, "На весь экран"]];

function select(key, opts, num) {
  const s = h("select", { onchange: () => { S[key] = num ? Number(s.value) : s.value; save(); apply(); } },
    ...opts.map(([v, t]) => h("option", { value: v, text: t })));
  s.value = S[key];
  return s;
}
function check(key) {
  const c = h("input", { type: "checkbox", onchange: () => { S[key] = c.checked; save(); apply(); } });
  c.checked = S[key];
  return c;
}
const rowOf = (label, ctl, hint) => h("label", { class: "set-row" }, h("span", {}, label, hint ? h("small", { text: hint }) : null), ctl);

let modal;
function build() {
  const fontVal = h("b", { text: S.font + " px" });
  const font = h("input", { type: "range", min: 11, max: 19, step: 1, value: S.font, oninput: () => { S.font = Number(font.value); fontVal.textContent = S.font + " px"; save(); apply(); } });
  const body = h("div", { class: "pop-body" },
    h("div", { class: "set-group", text: "Внешний вид" }),
    rowOf("Размер текста", h("div", { class: "set-range" }, font, fontVal)),
    rowOf("Рабочий стол", select("wall", WALLS)),
    rowOf("Цвет окон (Aero)", select("glass", GLASS)),
    rowOf("Ширина на компьютере", select("width", WIDTHS, true)),
    rowOf("Компактный режим", check("compact"), "Меньше отступов в списках и переписке"),
    rowOf("Анимации", check("anim"), "Выключите, если интерфейс тормозит"),
    h("div", { class: "set-group", text: "Переписка" }),
    rowOf("Показывать время сообщений", check("time")),
    rowOf("Подпись «говорит:»", check("says")),
    rowOf("Отправка сообщения", select("send", [["enter", "Enter (Shift+Enter — перенос)"], ["ctrl", "Ctrl+Enter (Enter — перенос)"]]), "На телефоне Enter всегда делает перенос"),
    h("div", { class: "set-note", text: "Настройки хранятся на этом устройстве." }),
    h("div", { class: "set-note", text: "Aero-Pik 1.1.0.0" }));
  const reset = h("button", { class: "btn danger-soft", type: "button", text: "Сбросить", onclick: () => { S = { ...DEF }; save(); apply(); modal.remove(); build(); modal.classList.remove("hidden"); } });
  modal = h("div", { id: "settingsModal", class: "modal hidden" },
    h("div", { class: "pop" }, h("div", { class: "pop-head", text: "Настройки" }), body,
      h("div", { class: "pop-foot" }, reset, h("button", { class: "btn", type: "button", text: "Готово", onclick: close }))));
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
  document.body.append(modal);
}
const close = () => modal && modal.classList.add("hidden");
function open() { if (!modal) build(); modal.classList.remove("hidden"); }

export function initSettings() {
  const btn = h("button", { id: "navSettings", type: "button", text: "Настройки", onclick: open });
  $("#navLogout").before(btn);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
