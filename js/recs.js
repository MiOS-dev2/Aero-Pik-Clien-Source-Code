import { db, doc, collection, getDocs, updateDoc, query, where, orderBy, limit, arrayUnion } from "./firebase.js";
import { state, bus } from "./state.js";
import { $, h, avatar, toast, errText } from "./utils.js";
import { openViewer } from "./viewer.js";
import { when } from "./wall.js";

const setNav = (id) => ["navMessages", "navRecs", "navWall"].forEach((x) => $("#" + x)?.classList.toggle("on", x === id));

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

async function loadPosts() {
  const channels = new Map();
  for (const c of state.chats.values()) if (c.type === "channel") channels.set(c.id, c);
  try {
    const s = await getDocs(query(collection(db, "chats"), where("type", "==", "channel"), limit(30)));
    s.docs.forEach((d) => channels.set(d.id, { id: d.id, ...d.data() }));
  } catch (e) { }

  const res = await Promise.allSettled([...channels.values()].map(async (c) => {
    const s = await getDocs(query(collection(db, "chats", c.id, "messages"), orderBy("createdAt", "desc"), limit(6)));
    return s.docs.map((d) => ({ id: d.id, channel: c, ...d.data() }));
  }));
  const posts = res.flatMap((r) => (r.status === "fulfilled" ? r.value : [])).filter((p) => p.text || p.image);
  return { posts: shuffle(posts).slice(0, 60), denied: res.some((r) => r.status === "rejected") };
}

async function openChannel(c) {
  try {
    if (!c.members.includes(state.me.uid)) {
      await updateDoc(doc(db, "chats", c.id), { members: arrayUnion(state.me.uid) });
      c = { ...c, members: [...c.members, state.me.uid] };
    }
    state.chats.set(c.id, c);
    bus.emit("chat:open", c.id);
  } catch (e) { toast(errText(e)); }
}

function card(p) {
  const c = p.channel, joined = c.members?.includes(state.me.uid);
  return h("div", { class: "rec-post" },
    avatar(c.avatar, c.name, 44),
    h("div", { class: "rec-body" },
      h("div", { class: "rec-top" },
        h("button", { class: "link rec-name", type: "button", text: c.name, onclick: () => openChannel(c) }),
        h("span", { class: "rec-time", text: when(p.createdAt) })),
      p.image ? h("img", { class: "rec-pic", src: p.image, alt: "Фото", onclick: () => openViewer(p.image) }) : null,
      p.text ? h("div", { class: "rec-txt", text: p.text }) : null,
      h("div", { class: "rec-foot" },
        h("button", { class: "mini" + (joined ? "" : " main"), type: "button", onclick: () => openChannel(c) }, joined ? "Открыть канал" : "Подписаться"))));
}

async function show() {
  bus.emit("chat:close");
  setNav("navRecs");
  $("#app").classList.add("chat-open");

  const list = h("div", { class: "feed-body" }, h("div", { class: "empty", text: "Загружаю публикации…" }));
  const again = h("button", { class: "leave", type: "button", onclick: show }, "Перемешать");
  const box = h("div", { class: "feed" },
    h("div", { class: "chat-head" },
      h("button", { class: "back-link", type: "button", onclick: () => bus.emit("chat:close") }, "‹ Диалоги"),
      h("div", { class: "chat-meta" }, h("div", { class: "chat-title", text: "Рекомендации" }), h("div", { class: "chat-sub", text: "Публикации из каналов вперемешку" })),
      again),
    list);
  $("#chat").replaceChildren(box);

  let r;
  try { r = await loadPosts(); } catch (e) { r = null; toast(errText(e)); }
  if (!box.isConnected) return;
  list.replaceChildren();
  if (!r || !r.posts.length) { list.append(h("div", { class: "empty", text: "Пока нет публикаций в каналах" })); return; }
  r.posts.forEach((p) => list.append(card(p)));
  if (r.denied) list.append(h("div", { class: "rec-note", text: "Часть каналов скрыта: опубликуйте обновлённый файл firestore.main.rules, чтобы видеть посты всех каналов." }));
}

export function initRecs() {
  $("#navRecs").onclick = show;
  bus.on("chat:open", () => setNav("navMessages"));
  bus.on("chat:close", () => setNav("navMessages"));
  bus.on("auth:out", () => setNav("navMessages"));
}
