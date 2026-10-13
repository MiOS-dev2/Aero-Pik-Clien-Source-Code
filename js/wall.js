import {
  db, doc, getDoc, setDoc, updateDoc, addDoc, collection, query, orderBy, limit,
  onSnapshot, serverTimestamp, writeBatch
} from "./firebase.js";
import { state, bus } from "./state.js";
import { $, h, avatar, toast, errText, compressImage } from "./utils.js";
import { putUser } from "./users.js";
import { openViewer } from "./viewer.js";

let unsub = null;

const stop = () => { unsub?.(); unsub = null; };
const setNav = (id) => ["navMessages", "navRecs", "navWall"].forEach((x) => $("#" + x)?.classList.toggle("on", x === id));

export function when(t) {
  if (!t || !t.toDate) return "только что";
  const d = t.toDate(), n = new Date();
  const hm = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(n) - day(d)) / 864e5);
  if (diff === 0) return "сегодня в " + hm;
  if (diff === 1) return "вчера в " + hm;
  const date = d.toLocaleDateString("ru-RU", d.getFullYear() === n.getFullYear() ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
  return date + " в " + hm;
}

async function resolve(target) {
  let uid = target.uid;
  if (!uid) {
    if (target.username === state.me.username) uid = state.me.uid;
    else {
      const s = await getDoc(doc(db, "usernames", target.username));
      if (!s.exists() || s.data().type !== "user") return null;
      uid = s.data().uid;
    }
  }
  const s = await getDoc(doc(db, "users", uid));
  return s.exists() ? { uid, ...s.data() } : null;
}

async function writeTo(uid) {
  const id = [state.me.uid, uid].sort().join("_");
  try {
    if (!state.chats.has(id)) {
      const ref = doc(db, "chats", id), s = await getDoc(ref);
      if (!s.exists()) {
        const data = { type: "direct", members: [state.me.uid, uid], lastMessage: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        await setDoc(ref, data);
        state.chats.set(id, { id, ...data, updatedAt: null });
      } else state.chats.set(id, { id, ...s.data() });
    }
    bus.emit("chat:open", id);
  } catch (e) { toast(errText(e)); }
}

function head(prevId, title) {
  const back = () => (prevId && state.chats.has(prevId) ? bus.emit("chat:open", prevId) : bus.emit("chat:close"));
  return h("div", { class: "chat-head" },
    h("button", { class: "back-link", type: "button", onclick: back }, "‹ Назад"),
    h("div", { class: "chat-meta" }, h("div", { class: "chat-title", text: title })));
}

export async function openWall(target) {
  stop();
  const prevId = state.currentId;
  bus.emit("chat:close");
  const mine = target.uid ? target.uid === state.me.uid : target.username === state.me.username;
  setNav(mine ? "navWall" : "navMessages");
  $("#app").classList.add("chat-open");

  const box = h("div", { class: "wall-view" }, head(prevId, "Профиль"), h("div", { class: "wall-body" }, h("div", { class: "empty", text: "Загружаю страницу…" })));
  $("#chat").replaceChildren(box);

  let u = null;
  try { u = await resolve(target); } catch (e) { toast(errText(e)); }
  if (!box.isConnected) return;
  const body = box.querySelector(".wall-body");
  if (!u) { body.replaceChildren(h("div", { class: "empty", text: "Профиль не найден" })); return; }
  box.replaceChildren(head(prevId, u.name), body);
  build(box, body, u, prevId);
}

function build(box, body, u, prevId) {
  const isMe = u.uid === state.me.uid;

  const statusBox = h("div", { class: "wall-status" });
  const drawStatus = () => {
    statusBox.replaceChildren();
    const st = u.status || "";
    if (!isMe) { if (st) statusBox.append(h("span", { class: "wall-status-txt", text: st })); return; }
    statusBox.append(h("button", { class: "link wall-status-txt" + (st ? "" : " dim"), type: "button", text: st || "Установить статус", onclick: editStatus }));
  };
  const editStatus = () => {
    const inp = h("input", { maxlength: "100", placeholder: "О чём думаете?" });
    inp.value = u.status || "";
    const save = async () => {
      const v = inp.value.trim();
      try {
        await updateDoc(doc(db, "users", u.uid), { status: v });
        u.status = v;
        state.me = { ...state.me, status: v };
        putUser(state.me);
        drawStatus();
      } catch (e) { toast(errText(e)); }
    };
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") drawStatus(); });
    statusBox.replaceChildren(inp, h("button", { class: "btn", type: "button", onclick: save }, "Сохранить"));
    inp.focus();
  };
  drawStatus();

  const info = [["Юзернейм", "@" + u.username]];
  if (u.createdAt?.toDate) info.push(["На сайте с", u.createdAt.toDate().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })]);

  const card = h("div", { class: "wall-card" },
    h("div", { class: "wall-ava" }, avatar(u.avatar, u.name, 120)),
    h("div", { class: "wall-info" },
      h("div", { class: "wall-name", text: u.name }),
      statusBox,
      h("table", { class: "wall-table" }, ...info.map(([k, v]) => h("tr", {}, h("td", { class: "k", text: k }), h("td", { text: v })))),
      isMe
        ? h("button", { class: "btn", type: "button", onclick: () => $("#navProfile").click() }, "Редактировать профиль")
        : h("button", { class: "btn", type: "button", onclick: () => writeTo(u.uid) }, "Отправить сообщение")));
  if (u.avatar) card.querySelector(".av").style.cursor = "zoom-in", card.querySelector(".av").addEventListener("click", () => openViewer(u.avatar));

  const count = h("span", { class: "wall-count" });
  const list = h("div", { class: "wall-list" });
  const sect = h("div", { class: "wall-sect" }, h("div", { class: "wall-sect-head" }, h("b", { text: "Стена" }), count));

  if (isMe) {
    let pending = null;
    const ta = h("textarea", { rows: "2", maxlength: "2000", placeholder: "Что у Вас нового?" });
    const slot = h("div", { class: "wall-attach" });
    const file = h("input", { type: "file", accept: "image/*", hidden: "" });
    const drawPending = () => {
      slot.replaceChildren();
      if (pending) slot.append(h("img", { src: pending, alt: "" }), h("button", { class: "link", type: "button", onclick: () => { pending = null; drawPending(); } }, "Убрать фото"));
    };
    file.addEventListener("change", async (e) => {
      const f = e.target.files[0]; e.target.value = "";
      if (!f) return;
      try { pending = await compressImage(f, { max: 1280 }); drawPending(); } catch (err) { toast(err.message); }
    });
    const send = h("button", { class: "btn", type: "button" }, "Отправить");
    send.onclick = async () => {
      const text = ta.value.trim(), image = pending;
      if (!text && !image) return;
      send.disabled = true;
      try {
        await addDoc(collection(db, "users", u.uid, "wall"), { authorId: state.me.uid, text, image: image || null, createdAt: serverTimestamp() });
        ta.value = ""; pending = null; drawPending();
      } catch (e) { toast(errText(e)); }
      finally { send.disabled = false; }
    };
    sect.append(h("div", { class: "wall-compose" }, ta, slot,
      h("div", { class: "wall-compose-bar" }, h("button", { class: "link", type: "button", onclick: () => file.click() }, "📎 Прикрепить фото"), send), file));
  }
  sect.append(list);
  body.replaceChildren(card, sect);

  const draw = (docs) => {
    count.textContent = docs.length ? `Записей: ${docs.length}` : "";
    list.replaceChildren();
    if (!docs.length) { list.append(h("div", { class: "empty", text: isMe ? "На вашей стене пока пусто. Напишите первую запись!" : "На стене пока нет записей" })); return; }
    for (const d of docs) {
      const p = d.data();
      list.append(h("div", { class: "wall-post" },
        avatar(u.avatar, u.name, 44),
        h("div", { class: "wall-post-body" },
          h("div", { class: "wall-post-name", text: u.name }),
          p.image ? h("img", { class: "wall-post-pic", src: p.image, alt: "Фото", onclick: () => openViewer(p.image) }) : null,
          p.text ? h("div", { class: "wall-post-txt", text: p.text }) : null,
          h("div", { class: "wall-post-foot" },
            h("span", { text: when(p.createdAt) }),
            isMe ? h("button", { class: "link", type: "button", onclick: () => removePost(d.ref) }, "Удалить") : null))));
    }
  };

  unsub = onSnapshot(query(collection(db, "users", u.uid, "wall"), orderBy("createdAt", "desc"), limit(50)),
    (snap) => { if (!box.isConnected) { stop(); return; } draw(snap.docs); },
    (e) => { list.replaceChildren(h("div", { class: "empty", text: errText(e) })); });
}

async function removePost(ref) {
  if (!confirm("Удалить запись со стены?")) return;
  try { const b = writeBatch(db); b.delete(ref); await b.commit(); } catch (e) { toast(errText(e)); }
}

export function initWall() {
  $("#navWall").onclick = () => openWall({ uid: state.me.uid });
  bus.on("wall:open", openWall);
  bus.on("chat:open", stop);
  bus.on("auth:out", stop);

  document.addEventListener("click", (e) => {
    const row = e.target.closest("#msgs .m[data-username]");
    if (row && e.target.closest(".av, .m-name")) { openWall({ username: row.dataset.username }); return; }

    const hd = e.target.closest("#head");
    if (hd && e.target.closest(".chat-meta, .av")) {
      const c = state.chats.get(state.currentId);
      if (c && c.type === "direct") {
        e.stopPropagation();
        openWall({ uid: c.members.find((x) => x !== state.me.uid) || state.me.uid });
        return;
      }
    }

    const mem = e.target.closest("#mBody .mem");
    if (mem && e.target.closest(".av, .mem-name")) {
      const un = (mem.querySelector(".mem-sub")?.textContent || "").replace(/^@/, "");
      if (un && un !== "?" && un !== "deleted") { $("#mClose").click(); openWall({ username: un }); }
      return;
    }

    const dlg = e.target.closest("#dialogs .dlg");
    if (dlg && state.searching && e.target.closest(".av") && dlg.querySelector(".mini")?.textContent === "Написать") {
      e.stopPropagation();
      const un = (dlg.querySelector(".dlg-prev")?.textContent || "").replace(/^@/, "");
      if (un) { bus.emit("search:clear"); openWall({ username: un }); }
    }
  }, true);
}
