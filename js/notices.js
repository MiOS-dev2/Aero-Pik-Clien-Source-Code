import { db, collection, addDoc, getDocs, query, orderBy, limit, serverTimestamp } from "./firebase.js";
import { state, bus } from "./state.js";
import { $, h, errText } from "./utils.js";

const SUPPORT = "questions2027@gmail.com";
const SESSION_KEY = "pik.loginId";
let modal = null;

function deviceName() {
  const ua = navigator.userAgent;
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "неизвестная система";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /YaBrowser/.test(ua) ? "Яндекс Браузер"
    : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "браузер";
  return `${br}, ${os}`;
}

async function recordLogin(uid) {
  try {
    const ref = await addDoc(collection(db, "users", uid, "logins"), { device: deviceName(), createdAt: serverTimestamp() });
    try { sessionStorage.setItem(SESSION_KEY, ref.id); } catch (e) {}
  } catch (e) { console.warn("Не удалось записать вход:", e); }
}

const fmt = (t) => t && t.toDate ? t.toDate().toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "только что";

async function render() {
  const body = modal.querySelector(".pop-body");
  body.replaceChildren(h("div", { class: "dlg-label", text: "Входы в аккаунт" }), h("div", { class: "empty", text: "Загрузка…" }));
  let mine = "";
  try { mine = sessionStorage.getItem(SESSION_KEY) || ""; } catch (e) {}
  try {
    const snap = await getDocs(query(collection(db, "users", state.me.uid, "logins"), orderBy("createdAt", "desc"), limit(30)));
    const list = snap.docs.map((d) => {
      const x = d.data();
      const row = h("div", {},
        h("div", { text: "Новый вход в аккаунт" + (d.id === mine ? " (это вы сейчас)" : "") }),
        h("small", { text: `${fmt(x.createdAt)} · ${x.device || "неизвестное устройство"}` }));
      row.style.cssText = "padding:8px 0;border-bottom:1px solid rgba(0,0,0,.12)";
      row.firstChild.style.fontWeight = "800";
      row.lastChild.style.color = "var(--muted)";
      return row;
    });
    body.replaceChildren(h("div", { class: "dlg-label", text: "Входы в аккаунт" }),
      ...(list.length ? list : [h("div", { class: "empty", text: "Пока нет записей о входах." })]),
      h("div", { class: "dlg-label", text: "Поддержка" }),
      supportLink());
  } catch (e) {
    body.replaceChildren(h("div", { class: "dlg-label", text: "Входы в аккаунт" }), h("div", { class: "empty", text: errText(e) }),
      h("div", { class: "dlg-label", text: "Поддержка" }), supportLink());
  }
}

function supportLink() {
  const subject = encodeURIComponent("Pik: обращение в поддержку");
  const text = encodeURIComponent(`Юзернейм: @${state.me?.username || ""}\n\n`);
  const a = h("a", { class: "btn", href: `mailto:${SUPPORT}?subject=${subject}&body=${text}`, text: "Написать в поддержку" });
  a.style.display = "inline-block";
  a.style.textDecoration = "none";
  const wrap = h("div", {}, a, h("small", { text: " " + SUPPORT }));
  wrap.style.padding = "8px 0";
  return wrap;
}

function open() {
  if (!modal) {
    modal = h("div", { id: "noticesModal", class: "modal hidden" },
      h("div", { class: "pop" },
        h("div", { class: "pop-head", text: "Оповещения системы" }),
        h("div", { class: "pop-body" }),
        h("div", { class: "pop-foot" }, h("button", { class: "btn light", type: "button", onclick: close }, "Закрыть"))));
    modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
    document.body.append(modal);
  }
  modal.classList.remove("hidden");
  render();
}
function close() { modal?.classList.add("hidden"); }

export function initNotices() {
  document.head.append(h("style", {}, "#navNotices::before { background-image: url(icons/vista.mail.webp); }"));
  $("#navLogout").before(h("button", { id: "navNotices", type: "button", text: "Оповещения системы", onclick: open }));
  bus.on("login:new", recordLogin);
  bus.on("auth:out", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
