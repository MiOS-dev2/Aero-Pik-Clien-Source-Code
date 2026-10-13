import { db, doc, getDoc } from "./firebase.js";
import { gdb } from "./groupsFirebase.js";

const cache = new Map();
const people = new Map();

export const cachedUser = (uid) => cache.get(uid);
export const putUser = (u) => cache.set(u.uid, u);
export const cachedPerson = (uid) => people.get(uid);
export const clearUsers = () => { cache.clear(); people.clear(); };

export async function getUser(uid) {
  if (cache.has(uid)) return cache.get(uid);
  let u;
  try {
    const s = await getDoc(doc(db, "users", uid));
    u = s.exists() ? { uid, ...s.data() } : { uid, username: "deleted", name: "Удалённый аккаунт", avatar: "" };
  } catch {
    u = { uid, username: "?", name: "Пользователь", avatar: "" };
  }
  cache.set(uid, u);
  return u;
}

export async function getPerson(uid) {
  if (people.has(uid)) return people.get(uid);
  let u;
  try {
    const s = await getDoc(doc(gdb, "people", uid));
    u = s.exists() ? { uid, ...s.data() } : { uid, username: "deleted", name: "Удалённый аккаунт", avatar: "" };
  } catch {
    u = { uid, username: "?", name: "Участник", avatar: "" };
  }
  people.set(uid, u);
  return u;
}
