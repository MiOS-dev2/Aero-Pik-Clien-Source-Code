import { db, doc, getDoc, updateDoc, writeBatch } from "./firebase.js";
import { gdb } from "./groupsFirebase.js";
import { EMAIL_DOMAIN } from "./config.js";
import { state, bus } from "./state.js";
import { putUser } from "./users.js";
import { aeroAlert } from "./aeroAlert.js";

export const normalizeHandle = (s) => (s || "").trim().replace(/^@/, "").toLowerCase();

export const isTaken = async (handle) => (await getDoc(doc(db, "usernames", handle))).exists();

export const takenAlert = (handle) => aeroAlert({
  title: "Pik",
  heading: `Юзернейм @${handle} уже занят`,
  text: "Этот юзернейм принадлежит другому пользователю или каналу. Выберите другой."
});

// true — юзернейм изменён, false — занят (окно предупреждения уже показано)
export async function changeMyUsername(next) {
  const me = state.me, old = me.username;
  if (await isTaken(next)) { takenAlert(next); return false; }
  // Вход в Firebase Auth идёт по первому юзернейму, поэтому запоминаем его отдельно
  const authEmail = me.authEmail || old + EMAIL_DOMAIN;
  try {
    const b = writeBatch(db);
    b.update(doc(db, "users", me.uid), { username: next, authEmail });
    b.delete(doc(db, "usernames", old));
    b.set(doc(db, "usernames", next), { uid: me.uid, type: "user", email: authEmail });
    await b.commit();
  } catch (e) {
    if (await isTaken(next).catch(() => false)) { takenAlert(next); return false; }
    throw e;
  }
  state.me = { ...me, username: next, authEmail };
  putUser(state.me);
  if (state.gUid) { try { await updateDoc(doc(gdb, "people", state.gUid), { username: next }); } catch {} }
  bus.emit("me:changed");
  return true;
}
