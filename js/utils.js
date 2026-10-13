export const $ = (s, r = document) => r.querySelector(s);

export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  e.append(...kids.filter(Boolean));
  return e;
}

const hash = (s = "") => { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) >>> 0; return x; };
export const hueOf = (s) => hash(s) % 360;
const PALETTE = ["#cfe0ff", "#bcd3ff", "#a9c6ff", "#dbe8ff", "#b3ccf7", "#c4d4f5", "#9fbcf0"];

export function avatar(url, name, size = 44) {
  const d = h("div", { class: "av" });
  d.style.width = d.style.height = size + "px";
  d.style.fontSize = Math.round(size * 0.42) + "px";
  if (url) d.append(h("img", { src: url, alt: "" }));
  else {
    d.textContent = (name || "?").trim().charAt(0).toUpperCase();
    d.style.background = PALETTE[hash(name) % PALETTE.length];
    d.style.color = "#16246b";
  }
  return d;
}

export const ts = (t) => (t && t.toMillis ? t.toMillis() : Date.now());

export function fmtTime(t) {
  if (!t || !t.toDate) return "";
  const d = t.toDate(), n = new Date();
  if (d.toDateString() === n.toDateString()) return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}
export const fmtClock = (t) => t && t.toDate ? t.toDate().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
export const fmtDay = (t) => t && t.toDate ? t.toDate().toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) : "Сегодня";

export function plural(n, a, b, c) {
  const m = n % 100, k = n % 10;
  return m > 10 && m < 15 ? c : k === 1 ? a : k > 1 && k < 5 ? b : c;
}

let toastTimer;
export function toast(msg) {
  document.querySelector(".toast")?.remove();
  const t = h("div", { class: "toast", text: msg });
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 3500);
}

export function errText(e) {
  const c = e?.code || "";
  if (c.includes("invalid-credential") || c.includes("wrong-password") || c.includes("user-not-found")) return "Неверный юзернейм или пароль";
  if (c.includes("email-already-in-use")) return "Этот юзернейм уже занят";
  if (c.includes("weak-password")) return "Пароль слишком простой — минимум 6 символов";
  if (c.includes("too-many-requests")) return "Слишком много попыток, попробуйте позже";
  if (c.includes("network")) return "Нет соединения с интернетом";
  if (c.includes("permission-denied")) return "Нет доступа. Проверьте правила Firestore (файл firestore.rules)";
  if (c.includes("operation-not-allowed")) return "В Firebase Authentication не включён вход по Email/Password";
  return e?.message || "Что-то пошло не так";
}

export async function compressImage(file, { max = 1280, square = false } = {}) {
  if (!file.type.startsWith("image/")) throw new Error("Выберите файл-изображение");
  const img = await new Promise((res, rej) => {
    const url = URL.createObjectURL(file), i = new Image();
    i.onload = () => { URL.revokeObjectURL(url); res(i); };
    i.onerror = () => rej(new Error("Не удалось открыть изображение"));
    i.src = url;
  });
  let scale = 1, q = 0.82, out;
  for (let n = 0; n < 8; n++) {
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (square) { const s = Math.min(sw, sh); sx = (sw - s) / 2; sy = (sh - s) / 2; sw = sh = s; }
    const k = Math.min(1, (max * scale) / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(sw * k));
    c.height = Math.max(1, Math.round(sh * k));
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    out = c.toDataURL("image/jpeg", q);
    if (out.length < 750000) return out;
    scale *= 0.8; q = Math.max(0.5, q - 0.05);
  }
  throw new Error("Изображение слишком большое");
}
