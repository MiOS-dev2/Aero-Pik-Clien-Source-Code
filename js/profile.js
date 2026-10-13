import { db, doc, updateDoc } from "./firebase.js";
import { state, bus } from "./state.js";
import { putUser } from "./users.js";
import { USERNAME_RE } from "./config.js";
import { normalizeHandle, changeMyUsername } from "./usernames.js";
import { syncPerson } from "./groupsAuth.js";
import { $, h, avatar, toast, errText, compressImage } from "./utils.js";

let picked = "";

function renderMe() {
  const me = state.me;
  $("#meBtn").replaceChildren(avatar(me.avatar, me.name, 26), h("span", { text: me.name }));
}

const drawAvatar = () => $("#pAvatar").replaceChildren(avatar(picked, $("#pName").value || state.me.name, 64));

function open() {
  picked = state.me.avatar || "";
  $("#pName").value = state.me.name;
  $("#pUser").value = "@" + state.me.username;
  $("#pErr").textContent = "";
  drawAvatar();
  $("#profileModal").classList.remove("hidden");
}
const close = () => $("#profileModal").classList.add("hidden");

async function save() {
  const name = $("#pName").value.trim();
  if (!name) { $("#pErr").textContent = "Введите имя"; return; }
  const un = normalizeHandle($("#pUser").value);
  try {
    if (un !== state.me.username) {
      if (!USERNAME_RE.test(un)) { $("#pErr").textContent = "Юзернейм: 3–32 символа, латиница, цифры и _, начинается с буквы"; return; }
      if (!(await changeMyUsername(un))) return;
    }
    await updateDoc(doc(db, "users", state.me.uid), { name, avatar: picked });
    state.me = { ...state.me, name, avatar: picked };
    putUser(state.me);
    syncPerson(state.me);
    bus.emit("me:changed");
    bus.emit("chats:render");
    close();
    toast("Готово! Профиль обновлён");
  } catch (e) { $("#pErr").textContent = errText(e); }
}

export function initProfile() {
  $("#meBtn").onclick = () => { if (window.matchMedia("(max-width: 800px)").matches) $("#app").classList.toggle("menu-open"); else open(); };
  $("#navProfile").onclick = open;
  $("#pPick").onclick = () => $("#fileAvatar").click();
  $("#pName").addEventListener("input", drawAvatar);
  $("#pClose").onclick = close;
  $("#pSave").onclick = save;
  $("#fileAvatar").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { picked = await compressImage(f, { max: 256, square: true }); drawAvatar(); }
    catch (err) { $("#pErr").textContent = err.message; }
  });
  $("#profileModal").addEventListener("mousedown", (e) => { if (e.target.id === "profileModal") close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

  bus.on("auth:in", renderMe);
  bus.on("me:changed", renderMe);
}
