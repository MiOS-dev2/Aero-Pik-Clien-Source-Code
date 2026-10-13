import { db, doc, collection, getDoc, writeBatch, serverTimestamp } from "./firebase.js";
import { USERNAME_RE } from "./config.js";
import { state, bus } from "./state.js";
import { $, avatar, toast, errText, compressImage } from "./utils.js";

let picked = "";

const drawAvatar = () => $("#cAvatar").replaceChildren(avatar(picked, $("#cName").value || "К", 64));

function open() {
  picked = "";
  ["cName", "cHandle", "cAbout"].forEach((id) => ($("#" + id).value = ""));
  $("#cErr").textContent = "";
  drawAvatar();
  $("#channelModal").classList.remove("hidden");
}
const close = () => $("#channelModal").classList.add("hidden");

async function create() {
  const name = $("#cName").value.trim();
  const handle = $("#cHandle").value.trim().replace(/^@/, "").toLowerCase();
  const about = $("#cAbout").value.trim();
  const err = $("#cErr"), btn = $("#cCreate");
  err.textContent = "";
  if (!name) { err.textContent = "Введите название канала"; return; }
  if (!USERNAME_RE.test(handle)) { err.textContent = "Юзернейм: 3–32 символа, латиница, цифры и _, начинается с буквы"; return; }
  btn.disabled = true;
  try {
    if ((await getDoc(doc(db, "usernames", handle))).exists()) { err.textContent = "Этот юзернейм уже занят"; return; }
    const ref = doc(collection(db, "chats"));
    const data = {
      type: "channel", name, handle, about, avatar: picked, ownerId: state.me.uid,
      members: [state.me.uid], lastMessage: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    const b = writeBatch(db);
    b.set(ref, data);
    b.set(doc(db, "usernames", handle), { uid: state.me.uid, type: "channel", chatId: ref.id });
    await b.commit();
    state.chats.set(ref.id, { id: ref.id, ...data, updatedAt: null });
    close();
    bus.emit("chat:open", ref.id);
    toast("Канал создан");
  } catch (e) { err.textContent = errText(e); }
  finally { btn.disabled = false; }
}

export function initChannels() {
  $("#navChannel").onclick = open;
  $("#cClose").onclick = close;
  $("#cCreate").onclick = create;
  $("#cPick").onclick = () => $("#fileChannel").click();
  $("#cName").addEventListener("input", drawAvatar);
  $("#fileChannel").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { picked = await compressImage(f, { max: 256, square: true }); drawAvatar(); }
    catch (err) { $("#cErr").textContent = err.message; }
  });
  $("#channelModal").addEventListener("mousedown", (e) => { if (e.target.id === "channelModal") close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
