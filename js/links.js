import { db, doc, getDoc } from "./firebase.js";
import { USERNAME_RE } from "./config.js";
import { bus } from "./state.js";
import { toast, errText } from "./utils.js";
import { openChannel } from "./search.js";

// Ссылка вида https://сайт/@юзернейм — человек или канал
function handleFromUrl() {
  let p = "";
  try { p = decodeURIComponent(location.pathname); } catch { return ""; }
  const m = p.match(/^\/@([^/]+)\/?$/);
  const h = m ? m[1].toLowerCase() : "";
  return USERNAME_RE.test(h) ? h : "";
}

async function follow(handle) {
  try {
    const s = await getDoc(doc(db, "usernames", handle));
    if (!s.exists()) { toast(`По ссылке @${handle} ничего не найдено`); return; }
    const d = s.data();
    if (d.type === "channel") {
      const c = await getDoc(doc(db, "chats", d.chatId));
      if (!c.exists()) { toast(`Канал @${handle} не найден`); return; }
      await openChannel({ id: c.id, ...c.data() });
    } else {
      bus.emit("wall:open", { username: handle });
    }
  } catch (e) { toast(errText(e)); }
}

export function initLinks() {
  let pending = handleFromUrl();
  if (pending) { try { history.replaceState(null, "", "/"); } catch {} }
  bus.on("auth:in", () => {
    if (!pending) return;
    const h = pending; pending = "";
    setTimeout(() => follow(h), 300);
  });
}
