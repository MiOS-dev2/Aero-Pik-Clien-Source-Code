import { db, doc, collection, getDocs, query, limit, updateDoc, writeBatch } from "./firebase.js";
import { gdb } from "./groupsFirebase.js";
import { state, bus } from "./state.js";
import { h, avatar, toast, errText, compressImage } from "./utils.js";
import { USERNAME_RE } from "./config.js";
import { normalizeHandle, isTaken, takenAlert } from "./usernames.js";

let modal = null, editId = null, picked = null;
let nameInp, handleInp, aboutInp, errEl, avaBox, fileInp;

const drawAva = () => {
  const c = state.chats.get(editId);
  avaBox.replaceChildren(avatar(picked !== null ? picked : (c?.avatar || ""), nameInp.value || c?.name || "К", 64));
};

function buildModal() {
  nameInp = h("input", { maxlength: "50" });
  handleInp = h("input", { maxlength: "32", autocapitalize: "none", spellcheck: "false" });
  aboutInp = h("textarea", { rows: "2", maxlength: "200" });
  errEl = h("div", { class: "err" });
  avaBox = h("span");
  fileInp = h("input", { type: "file", accept: "image/*", hidden: "" });
  nameInp.addEventListener("input", drawAva);
  fileInp.addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try { picked = await compressImage(f, { max: 256, square: true }); drawAva(); }
    catch (err) { errEl.textContent = err.message; }
  });
  const saveBtn = h("button", { class: "btn", type: "button", onclick: () => save(saveBtn) }, "Сохранить");
  modal = h("div", { class: "modal hidden" },
    h("div", { class: "pop" },
      h("div", { class: "pop-head", text: "Изменить канал" }),
      h("div", { class: "pop-body" },
        h("div", { class: "ava-pick" }, avaBox, h("button", { class: "link", type: "button", onclick: () => fileInp.click() }, "Выбрать фото канала")),
        h("label", { class: "row" }, h("span", { text: "Название" }), nameInp),
        h("label", { class: "row" }, h("span", { text: "Юзернейм канала" }), h("div", { class: "at-wrap" }, h("b", { text: "@" }), handleInp)),
        h("label", { class: "row" }, h("span", { text: "Описание" }), aboutInp),
        errEl, fileInp),
      h("div", { class: "pop-foot" }, h("button", { class: "btn light", type: "button", onclick: closeEdit }, "Отмена"), saveBtn)));
  modal.addEventListener("mousedown", (e) => { if (e.target === modal) closeEdit(); });
  document.body.append(modal);
}

function openEdit(id) {
  const c = state.chats.get(id);
  if (!c || c.type !== "channel" || c.ownerId !== state.me.uid) return;
  if (!modal) buildModal();
  editId = id; picked = null;
  nameInp.value = c.name || "";
  handleInp.value = c.handle || "";
  aboutInp.value = c.about || "";
  errEl.textContent = "";
  drawAva();
  modal.classList.remove("hidden");
}

function closeEdit() { editId = null; modal?.classList.add("hidden"); }

async function save(btn) {
  const c = state.chats.get(editId);
  if (!c) { closeEdit(); return; }
  const name = nameInp.value.trim();
  errEl.textContent = "";
  if (!name) { errEl.textContent = "Введите название канала"; return; }
  const handle = normalizeHandle(handleInp.value);
  const rename = handle !== c.handle;
  if (rename && !USERNAME_RE.test(handle)) { errEl.textContent = "Юзернейм: 3–32 символа, латиница, цифры и _, начинается с буквы"; return; }
  const patch = { name, about: aboutInp.value.trim() };
  if (picked !== null) patch.avatar = picked;
  btn.disabled = true;
  try {
    if (rename) {
      if (await isTaken(handle)) { takenAlert(handle); return; }
      patch.handle = handle;
      const b = writeBatch(db);
      b.update(doc(db, "chats", c.id), patch);
      if (c.handle) b.delete(doc(db, "usernames", c.handle));
      b.set(doc(db, "usernames", handle), { uid: state.me.uid, type: "channel", chatId: c.id });
      try { await b.commit(); }
      catch (e) { if (await isTaken(handle).catch(() => false)) { takenAlert(handle); return; } throw e; }
    } else {
      await updateDoc(doc(db, "chats", c.id), patch);
    }
    Object.assign(c, patch);
    closeEdit();
    bus.emit("chat:head"); bus.emit("chats:render");
    toast("Канал обновлён");
  } catch (e) { errEl.textContent = errText(e); }
  finally { btn.disabled = false; }
}

async function wipeMessages(dbx, col, id) {
  const ref = collection(dbx, col, id, "messages");
  for (;;) {
    const s = await getDocs(query(ref, limit(15)));
    if (s.empty) return;
    const b = writeBatch(dbx);
    s.docs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }
}

async function removeChat(id) {
  const c = state.chats.get(id);
  if (!c) return;
  const channel = c.type === "channel", group = c.type === "group";
  const text = channel ? `Удалить канал «${c.name}»? Он исчезнет у всех подписчиков вместе со всеми публикациями. Это нельзя отменить.`
    : group ? `Удалить группу «${c.name}»? Она исчезнет у всех участников вместе со всей перепиской. Это нельзя отменить.`
    : "Удалить этот личный чат? Переписка исчезнет и у вас, и у собеседника. Это нельзя отменить.";
  if (!confirm(text)) return;

  const dbx = group ? gdb : db, col = group ? "groups" : "chats";
  bus.emit("chat:close");
  toast("Удаляю…");
  try {
    await wipeMessages(dbx, col, id);
    const b = writeBatch(dbx);
    b.delete(doc(dbx, col, id));
    if (channel && c.handle) b.delete(doc(db, "usernames", c.handle));
    await b.commit();
    state.chats.delete(id);
    bus.emit("chats:render");
    toast(channel ? "Канал удалён" : group ? "Группа удалена" : "Чат удалён");
  } catch (e) { toast(errText(e)); }
}

export function initManage() {
  bus.on("chat:edit", openEdit);
  bus.on("chat:delete", removeChat);
  bus.on("auth:out", closeEdit);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEdit(); });
}
