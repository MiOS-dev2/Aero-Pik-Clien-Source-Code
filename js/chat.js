import {
  db, doc, collection, query, orderBy, limitToLast, onSnapshot, addDoc, updateDoc, serverTimestamp, arrayRemove
} from "./firebase.js";
import { gdb } from "./groupsFirebase.js";
import { state, bus } from "./state.js";
import { $, h, avatar, fmtClock, fmtDay, toast, errText, compressImage, hueOf } from "./utils.js";
import { getUser, cachedUser, getPerson, cachedPerson } from "./users.js";
import { chatInfo } from "./dialogs.js";
import { openViewer } from "./viewer.js";

let unsub = null;
let pendingImage = null;
let lastMsgs = [];

const ICON_CLIP = '<svg viewBox="0 0 24 24"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.8-8.8a3.7 3.7 0 0 1 5.2 5.2l-8.8 8.8a1.8 1.8 0 0 1-2.6-2.6l8-8"/></svg>';
const svgEl = (s) => { const t = document.createElement("span"); t.innerHTML = s; return t.firstElementChild; };

const isGroup = (c) => c.type === "group";
const dbOf = (c) => (isGroup(c) ? gdb : db);
const colOf = (c) => (isGroup(c) ? "groups" : "chats");
const myId = (c) => (isGroup(c) ? state.gUid : state.me.uid);

function senderOf(c, m) {
  if (c.type === "channel") return { name: c.name, avatar: c.avatar };
  const u = isGroup(c) ? cachedPerson(m.senderId) : cachedUser(m.senderId);
  return u || { name: "…", avatar: "" };
}

function showPlaceholder() {
  $("#chat").replaceChildren(h("div", { class: "chat-empty" }, "Выберите контакт слева — или найдите кого-нибудь по @юзернейму."));
}

function openChat(id) {
  const c = state.chats.get(id);
  if (!c) return;
  state.currentId = id; pendingImage = null; lastMsgs = [];
  unsub?.();
  $("#chat").replaceChildren(h("div", { class: "chat-head", id: "head" }), h("div", { class: "msgs", id: "msgs" }), h("div", { id: "foot" }));
  renderHead(); renderFoot();
  $("#app").classList.add("chat-open");
  bus.emit("chats:render");

  const q = query(collection(dbOf(c), colOf(c), id, "messages"), orderBy("createdAt"), limitToLast(150));
  unsub = onSnapshot(q, (snap) => {
    if (state.currentId !== id) return;
    lastMsgs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    drawMessages();
    const known = isGroup(c) ? cachedPerson : cachedUser;
    const load = isGroup(c) ? getPerson : getUser;
    const missing = [...new Set(lastMsgs.map((m) => m.senderId))].filter((u) => !known(u));
    if (missing.length && c.type !== "channel") Promise.all(missing.map(load)).then(() => { if (state.currentId === id) drawMessages(); });
  }, (e) => toast(errText(e)));
}

function closeChat() {
  unsub?.(); unsub = null;
  state.currentId = null; pendingImage = null;
  $("#app").classList.remove("chat-open");
  showPlaceholder();
  bus.emit("chats:render");
}

function renderHead() {
  const c = state.chats.get(state.currentId), head = $("#head");
  if (!c || !head) return;
  const i = chatInfo(c);
  const sub = c.type === "channel" && c.about ? `${i.sub} · ${c.about}` : i.sub;
  const showInfo = () => bus.emit("chat:info", c.id);
  const meta = h("div", { class: "chat-meta", onclick: showInfo }, h("div", { class: "chat-title", text: i.title }), h("div", { class: "chat-sub", text: sub }));
  meta.style.cursor = "pointer";
  const ava = avatar(i.avatar, i.title, 36);
  ava.style.cursor = "pointer";
  ava.addEventListener("click", showInfo);
  head.replaceChildren(
    h("button", { class: "back-link", onclick: closeChat }, "‹ Диалоги"),
    meta,
    isGroup(c) ? h("button", { class: "leave", onclick: () => bus.emit("group:members", c.id) }, "Участники") : null,
    c.type === "channel" && c.ownerId !== state.me.uid ? h("button", { class: "leave", onclick: leaveChannel }, "Отписаться") : null,
    c.type === "channel" && c.ownerId === state.me.uid ? h("button", { class: "leave", onclick: () => bus.emit("chat:edit", c.id) }, "Изменить") : null,
    c.type === "direct" || c.ownerId === myId(c) ? h("button", { class: "leave", style: "color:var(--danger)", onclick: () => bus.emit("chat:delete", c.id) }, "Удалить") : null,
    ava
  );
}

async function leaveChannel() {
  const c = state.chats.get(state.currentId);
  if (!c || !confirm(`Отписаться от «${c.name}»?`)) return;
  try {
    await updateDoc(doc(db, "chats", c.id), { members: arrayRemove(state.me.uid) });
    state.chats.delete(c.id);
    closeChat();
  } catch (e) { toast(errText(e)); }
}

function renderFoot() {
  const c = state.chats.get(state.currentId), foot = $("#foot");
  if (!c || !foot) return;
  foot.replaceChildren();
  if (c.type === "channel" && c.ownerId !== state.me.uid) {
    foot.append(h("div", { class: "readonly", text: "Писать в канале может только его владелец" }));
    return;
  }
  const ta = h("textarea", { id: "input", rows: "2", placeholder: c.type === "channel" ? "Опубликовать в канале…" : "Чирикни что-нибудь…" });
  ta.addEventListener("input", () => { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 160) + "px"; });
  ta.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !matchMedia("(pointer:coarse)").matches) { e.preventDefault(); sendMessage(); }
  });
  foot.append(
    h("div", { id: "attachSlot" }),
    h("div", { class: "composer" }, ta,
      h("div", { class: "composer-bar" },
        h("button", { class: "attach-btn", type: "button", onclick: () => $("#fileImage").click() }, svgEl(ICON_CLIP), "Прикрепить фото"),
        h("button", { class: "btn", type: "button", onclick: sendMessage }, "Отправить")))
  );
  renderAttach();
}

function renderAttach() {
  const slot = $("#attachSlot");
  if (!slot) return;
  slot.replaceChildren();
  if (pendingImage) slot.append(h("div", { class: "attach-prev" },
    h("img", { src: pendingImage, alt: "" }),
    h("span", { text: "Фото будет отправлено вместе с сообщением" }),
    h("button", { class: "link", onclick: () => { pendingImage = null; renderAttach(); } }, "Убрать")));
}

function drawMessages() {
  const box = $("#msgs"), c = state.chats.get(state.currentId);
  if (!box || !c) return;
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120 || !box.childElementCount;
  box.replaceChildren();
  if (!lastMsgs.length) box.append(h("div", { class: "chat-empty", text: c.type === "channel" ? "В канале пока нет публикаций" : "Сообщений пока нет. Напишите первым!" }));

  let lastDay = "", prev = null, prevDate = null;
  for (const m of lastMsgs) {
    const d = m.createdAt?.toDate ? m.createdAt.toDate() : new Date();
    const day = d.toDateString();
    if (day !== lastDay) { box.append(h("div", { class: "day" }, h("span", { text: fmtDay(m.createdAt) }))); lastDay = day; prev = null; }
    const grouped = prev && prev.senderId === m.senderId && d - prevDate < 5 * 60 * 1000;
    const u = senderOf(c, m);

    const body = h("div", { class: "m-body" });
    if (!grouped) body.append(h("div", { class: "m-top" }, h("span", { class: "m-name", text: u.name }), h("span", { class: "m-time", text: fmtClock(m.createdAt) })));
    if (m.image) body.append(h("img", { class: "m-pic", src: m.image, alt: "Фото", onclick: () => openViewer(m.image) }));
    if (m.text) body.append(h("div", { class: "m-txt", text: m.text }));

    const mine = c.type !== "channel" && m.senderId === myId(c);
    const row = h("div", { class: "m" + (mine ? " mine" : ""), title: fmtClock(m.createdAt) }, grouped ? h("div", { class: "m-gap" }) : avatar(u.avatar, u.name, 38), body);
    row.style.setProperty("--hue", hueOf(u.name));
    if (u.username && u.username !== "?" && u.username !== "deleted") row.dataset.username = u.username;
    box.append(row);
    prev = m; prevDate = d;
  }
  if (nearBottom) box.scrollTop = box.scrollHeight;
}

async function sendMessage() {
  const ta = $("#input"), c = state.chats.get(state.currentId);
  if (!ta || !c) return;
  const text = ta.value.trim(), image = pendingImage;
  if (!text && !image) return;
  if (isGroup(c) && !state.gUid) { toast("Группы недоступны: нет входа во второй проект"); return; }
  ta.value = ""; ta.style.height = "auto"; pendingImage = null; renderAttach();
  const sid = myId(c);
  try {
    await addDoc(collection(dbOf(c), colOf(c), c.id, "messages"), { senderId: sid, text, image: image || null, createdAt: serverTimestamp() });
    await updateDoc(doc(dbOf(c), colOf(c), c.id), {
      lastMessage: { text: text.slice(0, 120), image: !!image, senderId: sid, senderName: state.me.name },
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    toast(errText(e));
    ta.value = text; pendingImage = image; renderAttach();
  }
}

export function initChat() {
  showPlaceholder();
  bus.on("chat:open", openChat);
  bus.on("chat:close", closeChat);
  bus.on("chat:head", renderHead);
  bus.on("chats:updated", () => { if (state.currentId && state.chats.has(state.currentId)) renderHead(); });
  bus.on("auth:out", () => { unsub?.(); unsub = null; pendingImage = null; showPlaceholder(); $("#app").classList.remove("chat-open"); });

  $("#fileImage").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { pendingImage = await compressImage(f, { max: 1280 }); renderAttach(); }
    catch (err) { toast(err.message); }
  });
}
