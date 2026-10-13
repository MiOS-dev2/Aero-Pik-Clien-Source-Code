import {
  doc, collection, setDoc, getDocs, updateDoc, query, where, limit,
  serverTimestamp, arrayUnion, arrayRemove
} from "./firebase.js";
import { gdb } from "./groupsFirebase.js";
import { state, bus } from "./state.js";
import { getPerson } from "./users.js";
import { reconnectGroups } from "./groupsAuth.js";
import { $, h, avatar, plural, toast, errText, compressImage } from "./utils.js";

let picked = "";
let chosen = new Map();
let membersId = null;

async function findPerson(raw) {
  const username = raw.trim().replace(/^@/, "").toLowerCase();
  if (!username) return null;
  const s = await getDocs(query(collection(gdb, "people"), where("username", "==", username), limit(1)));
  if (s.empty) return null;
  const d = s.docs[0];
  return { uid: d.id, ...d.data() };
}
const NOT_FOUND = "Пользователь не найден. Он должен хотя бы раз войти в Pik после обновления.";

const drawAvatar = () => $("#gAvatar").replaceChildren(avatar(picked, $("#gName").value || "Г", 64));

function renderChips() {
  $("#gChips").replaceChildren(...[...chosen.values()].map((p) =>
    h("span", { class: "chip" }, "@" + p.username, h("button", { type: "button", "aria-label": "Убрать", onclick: () => { chosen.delete(p.uid); renderChips(); } }, "✕"))));
}

async function addChip() {
  const inp = $("#gMember"), err = $("#gErr");
  err.textContent = "";
  try {
    const p = await findPerson(inp.value);
    if (!inp.value.trim()) return;
    if (!p) { err.textContent = NOT_FOUND; return; }
    if (p.uid === state.gUid) { err.textContent = "Вы и так будете в группе"; return; }
    chosen.set(p.uid, p); renderChips(); inp.value = "";
  } catch (e) { err.textContent = errText(e); }
}

async function openCreate() {
  if (!state.gUid) {
    toast("Подключаю группы…");
    const r = await reconnectGroups(state.me);
    if (!state.gUid) { toast(r.error); return; }
    bus.emit("groups:ready");
    if (!r.ok) toast(r.error);
  }
  picked = ""; chosen = new Map();
  ["gName", "gMember"].forEach((id) => ($("#" + id).value = ""));
  $("#gErr").textContent = "";
  drawAvatar(); renderChips();
  $("#groupModal").classList.remove("hidden");
}
const closeCreate = () => $("#groupModal").classList.add("hidden");

async function createGroup() {
  const name = $("#gName").value.trim(), err = $("#gErr"), btn = $("#gCreate");
  err.textContent = "";
  if (!name) { err.textContent = "Введите название группы"; return; }
  btn.disabled = true;
  try {
    if ($("#gMember").value.trim()) await addChip();
    const ref = doc(collection(gdb, "groups"));
    const data = {
      type: "group", name, avatar: picked, ownerId: state.gUid,
      members: [state.gUid, ...chosen.keys()],
      lastMessage: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    await setDoc(ref, data);
    state.chats.set(ref.id, { id: ref.id, ...data, updatedAt: null });
    closeCreate();
    bus.emit("chat:open", ref.id);
    toast("Стая в сборе! Группа создана");
  } catch (e) { err.textContent = errText(e); }
  finally { btn.disabled = false; }
}

async function renderMembers() {
  const c = state.chats.get(membersId);
  if (!c) { closeMembers(); return; }
  const owner = c.ownerId === state.gUid;
  $("#mTitle").textContent = c.name;
  $("#mLeave").classList.toggle("hidden", owner);

  const body = $("#mBody");
  body.replaceChildren();
  if (owner) {
    const inp = h("input", { placeholder: "@юзернейм нового участника", autocapitalize: "none", spellcheck: "false" });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") addMember(inp); });
    body.append(h("div", { class: "add-row" }, inp, h("button", { class: "btn", type: "button", onclick: () => addMember(inp) }, "Добавить")));
  }
  const n = c.members.length;
  body.append(h("div", { class: "dlg-label", text: `${n} ${plural(n, "участник", "участника", "участников")}` }));
  const people = await Promise.all(c.members.map(getPerson));
  if (membersId !== c.id) return;
  for (const p of people) {
    body.append(h("div", { class: "mem" },
      avatar(p.avatar, p.name, 36),
      h("div", { class: "mem-meta" },
        h("div", { class: "mem-name", text: p.name + (p.uid === c.ownerId ? " · владелец" : "") }),
        h("div", { class: "mem-sub", text: "@" + p.username })),
      owner && p.uid !== c.ownerId ? h("button", { class: "link", type: "button", onclick: () => removeMember(p) }, "Убрать") : null));
  }
}

function openMembers(id) {
  membersId = id;
  $("#membersModal").classList.remove("hidden");
  renderMembers();
}
const closeMembers = () => { membersId = null; $("#membersModal").classList.add("hidden"); };

async function addMember(inp) {
  const c = state.chats.get(membersId);
  if (!c) return;
  try {
    const p = await findPerson(inp.value);
    if (!inp.value.trim()) return;
    if (!p) { toast(NOT_FOUND); return; }
    if (c.members.includes(p.uid)) { toast("Этот человек уже в группе"); return; }
    await updateDoc(doc(gdb, "groups", c.id), { members: arrayUnion(p.uid) });
    c.members = [...c.members, p.uid];
    bus.emit("chat:head"); bus.emit("chats:render");
    renderMembers();
  } catch (e) { toast(errText(e)); }
}

async function removeMember(p) {
  const c = state.chats.get(membersId);
  if (!c || !confirm(`Убрать ${p.name} из группы?`)) return;
  try {
    await updateDoc(doc(gdb, "groups", c.id), { members: arrayRemove(p.uid) });
    c.members = c.members.filter((x) => x !== p.uid);
    bus.emit("chat:head"); bus.emit("chats:render");
    renderMembers();
  } catch (e) { toast(errText(e)); }
}

async function leaveGroup() {
  const c = state.chats.get(membersId);
  if (!c || !confirm(`Покинуть группу «${c.name}»?`)) return;
  try {
    await updateDoc(doc(gdb, "groups", c.id), { members: arrayRemove(state.gUid) });
    state.chats.delete(c.id);
    closeMembers();
    bus.emit("chat:close");
  } catch (e) { toast(errText(e)); }
}

export function initGroups() {
  $("#navGroup").onclick = openCreate;
  $("#gClose").onclick = closeCreate;
  $("#gCreate").onclick = createGroup;
  $("#gAdd").onclick = addChip;
  $("#gMember").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); addChip(); } });
  $("#gName").addEventListener("input", drawAvatar);
  $("#gPick").onclick = () => $("#fileGroup").click();
  $("#fileGroup").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { picked = await compressImage(f, { max: 256, square: true }); drawAvatar(); }
    catch (err) { $("#gErr").textContent = err.message; }
  });

  $("#mClose").onclick = closeMembers;
  $("#mLeave").onclick = leaveGroup;

  $("#groupModal").addEventListener("mousedown", (e) => { if (e.target.id === "groupModal") closeCreate(); });
  $("#membersModal").addEventListener("mousedown", (e) => { if (e.target.id === "membersModal") closeMembers(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeCreate(); closeMembers(); } });

  bus.on("group:members", openMembers);
  bus.on("auth:out", () => { closeCreate(); closeMembers(); });
}
