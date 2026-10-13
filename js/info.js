import { state, bus } from "./state.js";
import { h, avatar, plural, toast } from "./utils.js";
import { SITE_URL } from "./config.js";
import { cachedUser } from "./users.js";

let modal = null, openId = null;

function usernameOf(c) {
  if (c.type === "channel") return c.handle;
  if (c.type === "group") return "";
  const otherId = c.members.find((x) => x !== state.me.uid) || state.me.uid;
  return cachedUser(otherId)?.username || "";
}

function infoOf(c) {
  if (c.type === "channel" || c.type === "group") return { name: c.name, avatar: c.avatar };
  const otherId = c.members.find((x) => x !== state.me.uid) || state.me.uid;
  const u = cachedUser(otherId);
  return { name: u?.name || "…", avatar: u?.avatar || "" };
}

function line(label, value) {
  const l = h("div", { class: "dlg-label", text: label });
  const v = h("div", { text: value });
  v.style.cssText = "font-weight:800;padding:0 0 8px;word-break:break-word";
  return [l, v];
}

function render() {
  const c = state.chats.get(openId);
  if (!c) { close(); return; }
  const i = infoOf(c), un = usernameOf(c);
  const body = modal.querySelector(".pop-body");
  const ava = h("div", {}, avatar(i.avatar, i.name, 96));
  ava.style.cssText = "display:flex;justify-content:center;margin-bottom:14px";
  body.replaceChildren(ava, ...line("Имя", i.name));
  if (un) {
    body.append(...line("Юзернейм", "@" + un));
    const [l, v] = line("Ссылка", `${SITE_URL}/@${un}`);
    v.style.cursor = "pointer"; v.title = "Нажмите, чтобы скопировать";
    v.onclick = async () => { try { await navigator.clipboard.writeText(`${SITE_URL}/@${un}`); toast("Ссылка скопирована"); } catch { toast(`${SITE_URL}/@${un}`); } };
    body.append(l, v);
  }
  if (c.type === "channel") {
    if (c.about) body.append(...line("Описание", c.about));
    const n = c.members.length;
    body.append(...line("Подписчики", `${n} ${plural(n, "подписчик", "подписчика", "подписчиков")}`));
  } else if (c.type === "group") {
    const n = c.members.length;
    body.append(...line("Участники", `${n} ${plural(n, "участник", "участника", "участников")}`));
  }
}

function open(id) {
  openId = id;
  if (!modal) {
    modal = h("div", { class: "modal hidden" },
      h("div", { class: "pop" },
        h("div", { class: "pop-head", text: "Информация" }),
        h("div", { class: "pop-body" }),
        h("div", { class: "pop-foot" }, h("button", { class: "btn light", type: "button", onclick: close }, "Закрыть"))));
    modal.addEventListener("mousedown", (e) => { if (e.target === modal) close(); });
    document.body.append(modal);
  }
  render();
  modal.classList.remove("hidden");
}

function close() {
  openId = null;
  modal?.classList.add("hidden");
}

export function initInfo() {
  bus.on("chat:info", open);
  bus.on("chats:updated", () => { if (openId) render(); });
  bus.on("auth:out", close);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
