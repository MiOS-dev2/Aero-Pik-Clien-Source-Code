import {
  auth, db, doc, getDoc, writeBatch, serverTimestamp,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, deleteUser
} from "./firebase.js";
import { EMAIL_DOMAIN, USERNAME_RE } from "./config.js";
import { state, bus } from "./state.js";
import { putUser, clearUsers } from "./users.js";
import { connectGroups, disconnectGroups } from "./groupsAuth.js";
import { $, errText, toast } from "./utils.js";

let mode = "login";
let registering = false;
let lastPass = null;

function setMode(m) {
  mode = m;
  $("#tabLogin").classList.toggle("on", m === "login");
  $("#tabReg").classList.toggle("on", m === "reg");
  document.querySelectorAll(".regOnly").forEach((e) => e.classList.toggle("hidden", m !== "reg"));
  $("#aGo").textContent = m === "login" ? "Войти" : "Создать аккаунт";
  $("#aPass").autocomplete = m === "login" ? "current-password" : "new-password";
  $("#aErr").textContent = "";
}

async function submit() {
  const username = $("#aUser").value.trim().replace(/^@/, "").toLowerCase();
  const pass = $("#aPass").value;
  const err = $("#aErr"), btn = $("#aGo");
  err.textContent = "";
  if (!USERNAME_RE.test(username)) { err.textContent = "Юзернейм: 3–32 символа, латиница, цифры и _, начинается с буквы"; return; }
  if (pass.length < 6) { err.textContent = "Пароль — минимум 6 символов"; return; }
  btn.disabled = true;
  lastPass = pass;
  try {
    if (mode === "login") {
      let email = username + EMAIL_DOMAIN;
      try { const u = await getDoc(doc(db, "usernames", username)); if (u.exists() && u.data().email) email = u.data().email; } catch (e) {}
      await signInWithEmailAndPassword(auth, email, pass);
    } else {
      const name = $("#aName").value.trim() || username;
      if ((await getDoc(doc(db, "usernames", username))).exists()) throw { code: "auth/email-already-in-use" };
      registering = true;
      const cred = await createUserWithEmailAndPassword(auth, username + EMAIL_DOMAIN, pass);
      try {
        const b = writeBatch(db);
        b.set(doc(db, "users", cred.user.uid), { username, name, avatar: "", createdAt: serverTimestamp() });
        b.set(doc(db, "usernames", username), { uid: cred.user.uid, type: "user" });
        await b.commit();
      } catch (e) { await deleteUser(cred.user).catch(() => {}); throw e; }
      registering = false;
      await boot(cred.user);
    }
  } catch (e) {
    registering = false; lastPass = null;
    err.textContent = errText(e);
  } finally { btn.disabled = false; }
}

async function boot(user) {
  try {
    const s = await getDoc(doc(db, "users", user.uid));
    if (!s.exists()) { toast("Профиль не найден"); await signOut(auth); return; }
    state.me = { uid: user.uid, ...s.data() };
    putUser(state.me);

    const hadPass = !!lastPass;
    const r = await connectGroups(state.me, lastPass);
    lastPass = null;
    if (!r.ok && hadPass) toast(r.error);

    $("#auth").classList.add("hidden");
    $("#app").classList.remove("hidden");
    document.getElementById("splash")?.remove();
    bus.emit("auth:in");
    if (hadPass) bus.emit("login:new", user.uid);
  } catch (e) { toast(errText(e)); }
}

function leave() {
  state.me = null; state.chats = new Map(); state.currentId = null; state.searching = false; state.gUid = null;
  clearUsers();
  bus.emit("auth:out");
  $("#app").classList.add("hidden");
  $("#auth").classList.remove("hidden");
  document.getElementById("splash")?.remove();
}

export function initAuth() {
  $("#tabLogin").onclick = () => setMode("login");
  $("#tabReg").onclick = () => setMode("reg");
  $("#aGo").onclick = submit;
  ["aUser", "aName", "aPass"].forEach((id) => $("#" + id).addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); }));
  $("#navLogout").onclick = async () => { await disconnectGroups(); await signOut(auth); };

  onAuthStateChanged(auth, async (user) => {
    if (registering) return;
    if (!user) leave(); else await boot(user);
  });
}
