export const state = {
  me: null,
  chats: new Map(),
  currentId: null,
  gUid: null,
  searching: false
};

const handlers = {};
export const bus = {
  on(event, fn) { (handlers[event] ||= []).push(fn); },
  emit(event, data) { (handlers[event] || []).forEach((fn) => fn(data)); }
};
