import {
  doc, setDoc, updateDoc,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut
} from "./firebase.js";
import { gauth, gdb } from "./groupsFirebase.js";
import { EMAIL_DOMAIN } from "./config.js";
import { state } from "./state.js";

let retryPass = null;

export function groupsErrText(e) {
  const c = e?.code || "";
  if (c.includes("operation-not-allowed") || c.includes("admin-restricted"))
    return "В проекте grup-6745c не включён вход по Email/Password: Firebase Console → Authentication → Sign-in method → Email/Password → Включить.";
  if (c.includes("configuration-not-found"))
    return "В проекте grup-6745c не запущен Authentication: откройте Authentication в консоли и нажмите «Начать».";
  if (c.includes("unauthorized-domain"))
    return "Домен не добавлен в проект grup-6745c: Authentication → Settings → Authorized domains.";
  if (c.includes("invalid-api-key") || c.includes("api-key-not-valid"))
    return "Неверный apiKey второго проекта (js/config.js).";
  if (c.includes("email-already-in-use"))
    return "Во втором проекте этот юзернейм уже занят с другим паролем.";
  if (c.includes("network"))
    return "Нет соединения с интернетом.";
  if (c.includes("permission-denied"))
    return "Firestore проекта grup-6745c не пускает запись: создайте базу и вставьте правила из firestore.groups.rules.";
  if (c.includes("too-many-requests"))
    return "Слишком много попыток входа, подождите немного.";
  return "Второй проект ответил ошибкой: " + (c || e?.message || "неизвестно");
}

export async function connectGroups(me, pass) {
  state.gUid = null;
  try {
    await gauth.authStateReady?.();
    const email = me.authEmail || me.username + EMAIL_DOMAIN;
    let user = gauth.currentUser;
    if (user && user.email !== email) { await signOut(gauth); user = null; }
    if (!user) {
      if (!pass) return { ok: false, error: "Нужен пароль, чтобы подключить группы" };
      try {
        user = (await signInWithEmailAndPassword(gauth, email, pass)).user;
      } catch (e) {
        const c = e?.code || "";
        if (c.includes("user-not-found") || c.includes("invalid-credential") || c.includes("invalid-login")) {
          user = (await createUserWithEmailAndPassword(gauth, email, pass)).user;
        } else throw e;
      }
    }
    state.gUid = user.uid;
    retryPass = null;
    try {
      await setDoc(doc(gdb, "people", user.uid),
        { username: me.username, name: me.name, avatar: me.avatar || "", mainUid: me.uid }, { merge: true });
    } catch (e) {
      console.warn("people:", e);
      return { ok: false, error: groupsErrText(e), partial: true };
    }
    return { ok: true };
  } catch (e) {
    console.warn("Группы недоступны:", e);
    state.gUid = null;
    retryPass = pass || null;
    return { ok: false, error: groupsErrText(e) };
  }
}

export async function reconnectGroups(me) {
  const pass = retryPass || prompt("Введите пароль ещё раз — подключу группы:");
  if (!pass) return { ok: false, error: "Без пароля группы не подключить" };
  return connectGroups(me, pass);
}

export async function syncPerson(me) {
  if (!state.gUid) return;
  try { await updateDoc(doc(gdb, "people", state.gUid), { name: me.name, avatar: me.avatar || "" }); } catch {}
}

export async function disconnectGroups() {
  state.gUid = null; retryPass = null;
  try { await signOut(gauth); } catch {}
}
