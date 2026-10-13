import { db, collection, query, where, onSnapshot } from "./firebase.js";
import { gdb } from "./groupsFirebase.js";
import { state, bus } from "./state.js";
import { $, h, avatar, fmtTime, ts, plural, toast, errText } from "./utils.js";
import { getUser, cachedUser } from "./users.js";

let unsubMain = null, unsubGroups = null;
let mainChats = new Map(), groupChats = new Map();
const seen = new Set();

export function chatInfo(c) {
  if (c.type === "channel") {
    const n = c.members.length;
    return { title: c.name, sub: `@${c.handle} · ${n} ${plural(n, "подписчик", "подписчика", "подписчиков")}`, avatar: c.avatar, channel: true };
  }
  if (c.type === "group") {
    const n = c.members.length;
    return { title: c.name, sub: `${n} ${plural(n, "участник", "участника", "участников")}`, avatar: c.avatar, group: true };
  }
  const otherId = c.members.find((x) => x !== state.me.uid) || state.me.uid;
  const u = cachedUser(otherId);
  if (!u) {
    getUser(otherId).then(() => { renderChats(); if (state.currentId === c.id) bus.emit("chat:head"); });
    return { title: "…", sub: "", avatar: "" };
  }
  return { title: u.name, sub: "@" + u.username, avatar: u.avatar };
}

function merge() {
  const old = state.chats;
  const next = new Map([...mainChats, ...groupChats]);
  next.forEach((_, id) => seen.add(id));
  let gone = false;
  if (state.currentId && old.has(state.currentId) && !next.has(state.currentId)) {
    if (seen.has(state.currentId)) gone = true; else next.set(state.currentId, old.get(state.currentId));
  }
  state.chats = next;
  renderChats();
  bus.emit("chats:updated");
  if (gone) { bus.emit("chat:close"); toast("Чат удалён или больше недоступен"); }
}

function listen() {
  unsubMain?.(); unsubGroups?.();
  mainChats = new Map(); groupChats = new Map();

  unsubMain = onSnapshot(query(collection(db, "chats"), where("members", "array-contains", state.me.uid)), (snap) => {
    mainChats = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    merge();
  }, (e) => toast(errText(e)));

  listenGroups();
}

function listenGroups() {
  unsubGroups?.(); unsubGroups = null;
  if (state.gUid) {
    unsubGroups = onSnapshot(query(collection(gdb, "groups"), where("members", "array-contains", state.gUid)), (snap) => {
      groupChats = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data(), type: "group" }]));
      merge();
    }, (e) => toast("Группы: " + errText(e)));
  }
}

export function renderChats() {
  if (state.searching) return;
  const list = $("#dialogs");
  list.replaceChildren();
  const arr = [...state.chats.values()].sort((a, b) => ts(b.updatedAt) - ts(a.updatedAt));
  if (!arr.length) {
    list.append(h("div", { class: "empty", text: "Список контактов пуст. Найдите кого-нибудь по @юзернейму в поиске сверху." }));
    return;
  }
  for (const c of arr) {
    const i = chatInfo(c);
    let prev = "Нет сообщений";
    const lm = c.lastMessage;
    if (lm) {
      const body = lm.text || (lm.image ? "Фото" : "");
      if (c.type === "group") prev = (lm.senderId === state.gUid ? "Вы" : (lm.senderName || "Участник")) + ": " + body;
      else prev = (lm.senderId === state.me.uid && !i.channel ? "Вы: " : "") + body;
    }
    list.append(
      h("button", { class: "dlg" + (c.id === state.currentId ? " on" : ""), onclick: () => bus.emit("chat:open", c.id) },
        avatar(i.avatar, i.title, 50),
        h("div", { class: "dlg-meta" },
          h("div", { class: "dlg-top" }, h("span", { class: "dlg-name", text: i.title }), h("span", { class: "dlg-time", text: fmtTime(c.updatedAt) })),
          h("div", { class: "dlg-prev", text: prev })))
    );
  }
}

export function initDialogs() {
  bus.on("auth:in", listen);
  bus.on("auth:out", () => {
    unsubMain?.(); unsubGroups?.(); unsubMain = unsubGroups = null;
    mainChats = new Map(); groupChats = new Map(); seen.clear();
    $("#dialogs").replaceChildren();
  });
  bus.on("chats:render", renderChats);
  bus.on("groups:ready", listenGroups);
}
