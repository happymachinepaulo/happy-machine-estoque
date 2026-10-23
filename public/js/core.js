export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fold = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const num = new Intl.NumberFormat('pt-BR');
export const n = v => num.format(Number(v) || 0);
export const icon = name => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const fmtDate = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); };
export const debounce = (fn, ms = 160) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const kindLabel = k => ({ entrada: 'Entrada', saida: 'Saída', ajuste: 'Ajuste', cadastro: 'Cadastro' }[k] || k);

let toastTimer;
export function toast(msg, error = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.className = 'toast', 3200);
}

/* ── sessão e API ── */
const KEY = 'hm-auth';
let sess = null, lockHandler = () => {}, refreshing = null;
try { sess = JSON.parse(localStorage.getItem(KEY)); } catch {}
export const onLock = fn => lockHandler = fn;
export const hasSession = () => !!sess?.refresh;
export function setSession(s) {
  sess = { access: s.access_token, refresh: s.refresh_token, exp: Date.now() + (s.expires_in || 3600) * 1000 };
  try { localStorage.setItem(KEY, JSON.stringify(sess)); } catch {}
}
export function clearSession() { sess = null; try { localStorage.removeItem(KEY); sessionStorage.clear(); } catch {} }
class AuthError extends Error {}
async function token(force) {
  if (!sess) throw new AuthError('Faça login para continuar.');
  if (!force && sess.exp - Date.now() > 60000) return sess.access;
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: sess.refresh }) })
    .then(async r => { if (!r.ok) throw new AuthError('Sessão expirada. Entre novamente.'); setSession(await r.json()); })
    .finally(() => refreshing = null);
  await refreshing; return sess.access;
}
async function send(url, opts, tk) {
  return fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + tk } });
}
async function request(url, opts = {}) {
  try {
    let r = await send(url, opts, await token(false));
    if (r.status === 401) r = await send(url, opts, await token(true));
    if (r.status === 401) throw new AuthError('Sessão expirada. Entre novamente.');
    return r;
  } catch (e) { if (e instanceof AuthError) { clearSession(); lockHandler(e.message); } throw e; }
}
export async function api(url, opts = {}) {
  if (opts.json !== undefined) { opts = { ...opts, method: opts.method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(opts.json) }; delete opts.json; }
  const r = await request(url, opts);
  const data = (r.headers.get('content-type') || '').includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(data?.error || `Erro ${r.status}`);
  return data;
}
export async function download(url, name) {
  const r = await request(url);
  if (!r.ok) throw new Error('Não foi possível baixar o arquivo.');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await r.blob()), download: name });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ── janelas ── */
export function open(d) { if (!d.open) d.showModal(); }
document.addEventListener('click', e => {
  const d = e.target.closest('dialog');
  if (e.target.closest('[data-close]')) return e.target.closest('dialog').close();
  if (d && e.target === d) d.close();
});
export function confirmBox(title, msg, ok = 'Confirmar') {
  const d = $('#dConfirm2'); $('#cTitle').textContent = title; $('#cMsg').textContent = msg; $('#cOk').textContent = ok;
  return new Promise(res => { d.addEventListener('close', () => res(d.returnValue === 'yes'), { once: true }); d.returnValue = 'no'; d.showModal(); });
}
export function zoom(src, caption = '') { $('#zImg').src = src; $('#zImg').alt = caption; $('#zCap').textContent = caption; open($('#dZoom')); }

/* ── fotos: reduz antes de enviar (original ≤1600px, miniatura 480px) ── */
export async function prepareImage(file) {
  if (!file || file.type === 'image/gif' || !file.type.startsWith('image/')) return { photo: file };
  let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { return { photo: file }; }
  const draw = (max, q) => new Promise(res => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); c.toBlob(res, 'image/jpeg', q);
  });
  const [photo, thumb] = await Promise.all([draw(1600, .84), draw(480, .78)]);
  bmp.close?.();
  return { photo: photo.size < file.size ? photo : file, thumb };
}
export function pickPhoto(inputs, preview, onFile) {
  let current = null;
  for (const input of inputs) input.addEventListener('change', () => {
    const f = input.files[0]; if (!f) return; current = f;
    preview.src = URL.createObjectURL(f); preview.classList.remove('hidden'); onFile?.(f);
    inputs.forEach(i => { if (i !== input) i.value = ''; });
  });
  return { get file() { return current; }, clear() { current = null; inputs.forEach(i => i.value = ''); preview.classList.add('hidden'); preview.removeAttribute('src'); } };
}
