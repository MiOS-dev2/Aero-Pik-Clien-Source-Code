import {
  db, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, limit,
  serverTimestamp, arrayUnion, documentId
} from "./firebase.js";
import { state, bus } from "./state.js";
import { $, h, avatar, plural, toast, errText } from "./utils.js";
import { getUser } from "./users.js";

let timer, token = 0;

async function runSearch(term) {
  const my = ++token;
  state.searching = true;
  const list = $("#dialogs");
  try {
    const snap = await getDocs(query(collection(db, "usernames"),
      where(documentId(), ">=", term), where(documentId(), "<=", term + "\uf8ff"), limit(8)));
    const items = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.type === "user" && data.uid !== state.me.uid) {
        const u = await getUser(data.uid);
        items.push({ kind: "user", title: u.name, sub: "@" + u.username, avatar: u.avatar, uid: u.uid });
      } else if (data.type === "channel") {
        const cs = await getDoc(doc(db, "chats", data.chatId));
        if (cs.exists()) {
          const c = { id: cs.id, ...cs.data() };
          const n = c.members.length;
          items.push({ kind: "channel", title: c.name, sub: `@${c.handle} · ${n} ${plural(n, "подписчик", "подписчика", "подписчиков")}`, avatar: c.avatar, chat: c });
        }
      }
    }
    if (my !== token) return;
    list.replaceChildren();
    if (!items.length) { list.append(h("div", { class: "empty", text: "Ничего не найдено. Проверьте юзернейм." })); return; }
    list.append(h("div", { class: "dlg-label", text: "Результаты поиска" }));
    for (const it of items) {
      const joined = it.chat && it.chat.members.includes(state.me.uid);
      list.append(h("button", { class: "dlg", onclick: () => it.kind === "user" ? startDirect(it.uid) : openChannel(it.chat) },
        avatar(it.avatar, it.title, 50),
        h("div", { class: "dlg-meta" }, h("div", { class: "dlg-name", text: it.title }), h("div", { class: "dlg-prev", text: it.sub })),
        h("span", { class: "mini" + (it.kind === "channel" && !joined ? " main" : ""), text: it.kind === "user" ? "Написать" : joined ? "Открыть" : "Подписаться" })));
    }
  } catch (e) { if (my === token) list.replaceChildren(h("div", { class: "empty", text: errText(e) })); }
}

async function startDirect(uid) {
  const id = [state.me.uid, uid].sort().join("_");
  try {
    if (!state.chats.has(id)) {
      const ref = doc(db, "chats", id);
      const s = await getDoc(ref);
      if (!s.exists()) {
        const data = { type: "direct", members: [state.me.uid, uid], lastMessage: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        await setDoc(ref, data);
        state.chats.set(id, { id, ...data, updatedAt: null });
      } else state.chats.set(id, { id, ...s.data() });
    }
    bus.emit("search:clear");
    bus.emit("chat:open", id);
  } catch (e) { toast(errText(e)); }
}

export async function openChannel(c) {
  try {
    if (!c.members.includes(state.me.uid)) {
      await updateDoc(doc(db, "chats", c.id), { members: arrayUnion(state.me.uid) });
      c = { ...c, members: [...c.members, state.me.uid] };
    }
    state.chats.set(c.id, c);
    bus.emit("search:clear");
    bus.emit("chat:open", c.id);
  } catch (e) { toast(errText(e)); }
}

function clearSearch() {
  $("#search").value = "";
  state.searching = false;
  bus.emit("chats:render");
}

export function initSearch() {
  $("#search").addEventListener("input", (e) => {
    clearTimeout(timer);
    const term = e.target.value.trim().replace(/^@/, "").toLowerCase();
    if (term.length < 2) { state.searching = false; bus.emit("chats:render"); return; }
    timer = setTimeout(() => runSearch(term), 250);
  });
  bus.on("search:clear", clearSearch);
  bus.on("auth:out", () => { $("#search").value = ""; });
}
