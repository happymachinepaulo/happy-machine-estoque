export const state = { me: null, products: [], pending: 0, listeners: new Set() };
export const subscribe = fn => (state.listeners.add(fn), () => state.listeners.delete(fn));
export function setData(d) {
  if (d.me) state.me = d.me;
  state.products = d.products; state.pending = d.pending_photos;
  for (const p of state.products) p._s = (p.name + ' ' + (p.category || '') + ' ' + (p.notes || '') + ' ' + p.id).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  try { sessionStorage.setItem('hm-boot', JSON.stringify({ products: state.products, pending_photos: state.pending, me: state.me })); } catch {}
  state.listeners.forEach(f => f());
}
export function cached() { try { return JSON.parse(sessionStorage.getItem('hm-boot')); } catch { return null; } }
export function patch(id, fields) {
  const p = state.products.find(x => x.id === id); if (p) Object.assign(p, fields);
  state.listeners.forEach(f => f());
}
