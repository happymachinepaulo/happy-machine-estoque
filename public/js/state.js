export const state = { me: null, products: [], pending: 0, holders: [], listeners: new Set() };
export const subscribe = fn => (state.listeners.add(fn), () => state.listeners.delete(fn));
export function setData(d) {
  if (d.me) state.me = d.me;
  state.products = d.products; state.pending = d.pending_photos; state.holders = d.holders || [];
  indexHolders();
  for (const p of state.products) p._s = (p.name + ' ' + (p.category || '') + ' ' + (p.notes || '') + ' ' + p.id).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  try { sessionStorage.setItem('hm-boot', JSON.stringify({ products: state.products, pending_photos: state.pending, me: state.me, holders: state.holders })); } catch {}
  state.listeners.forEach(f => f());
}
/* quanto de cada peça está com cada pessoa: p._out = total fora, p._with = [{holder, quantity}] */
function indexHolders() {
  const by = new Map(state.products.map(p => [p.id, p]));
  for (const p of state.products) { p._out = 0; p._with = []; }
  for (const h of state.holders) for (const it of h.items) {
    const p = by.get(it.product_id); if (!p) continue;
    p._out += it.quantity; p._with.push({ holder: h, quantity: it.quantity });
  }
}
export const activeHolders = () => state.holders.filter(h => h.active);
export function cached() { try { return JSON.parse(sessionStorage.getItem('hm-boot')); } catch { return null; } }
export function patch(id, fields) {
  const p = state.products.find(x => x.id === id); if (p) Object.assign(p, fields);
  state.listeners.forEach(f => f());
}
