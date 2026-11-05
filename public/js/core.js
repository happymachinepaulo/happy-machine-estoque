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
/* imagem que exige login (fotos do galpão): baixa com o token e guarda o endereço local */
const blobs = new Map();
export function blobUrl(url) {
  if (!blobs.has(url)) blobs.set(url, request(url).then(async r => { if (!r.ok) throw new Error('Foto indisponível'); return URL.createObjectURL(await r.blob()); }).catch(e => { blobs.delete(url); throw e; }));
  return blobs.get(url);
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
  return { get file() { return current; }, set(f) { current = f; preview.src = URL.createObjectURL(f); preview.classList.remove('hidden'); inputs.forEach(i => i.value = ''); }, clear() { current = null; inputs.forEach(i => i.value = ''); preview.classList.add('hidden'); preview.removeAttribute('src'); } };
}

/* ── abas e subabas com indicador deslizante ── */
export function slide(container, ink, active) {
  if (!active || !ink) return;
  const c = container.getBoundingClientRect(), a = active.getBoundingClientRect();
  ink.style.width = a.width + 'px';
  ink.style.transform = `translateX(${a.left - c.left + container.scrollLeft}px)`;
}
/* items: [{key,label,count?,accent?,dot?,icon?,cls?}] — desenha os botões e desliza o indicador até o selecionado */
export function subtabs(el, items, value, onPick) {
  let ink = el.querySelector(':scope > .subInk');
  const html = items.map(t => `<button class="sub ${t.cls || ''}" role="tab" data-key="${esc(t.key)}" aria-selected="${t.key === value}"${t.accent ? ` style="--accent:${t.accent}"` : ''}>${t.dot ? '<span class="dot"></span>' : ''}${t.icon ? icon(t.icon) : ''}${esc(t.label)}${t.count !== undefined ? `<small>${n(t.count)}</small>` : ''}</button>`).join('');
  el.querySelectorAll(':scope > .sub').forEach(b => b.remove());
  el.insertAdjacentHTML('afterbegin', html);
  if (!ink) { ink = document.createElement('span'); ink.className = 'subInk'; el.append(ink); }
  el.setAttribute('role', 'tablist');
  const act = el.querySelector('.sub[aria-selected=true]');
  if (act) { ink.style.background = getComputedStyle(act).getPropertyValue('--accent').trim() || ''; if (act.offsetLeft < el.scrollLeft || act.offsetLeft + act.offsetWidth > el.scrollLeft + el.clientWidth) el.scrollTo({ left: act.offsetLeft - 24, behavior: 'smooth' }); }
  requestAnimationFrame(() => slide(el, ink, act));
  el.onclick = e => { const b = e.target.closest('.sub'); if (b) onPick(b.dataset.key); };
}
addEventListener('resize', debounce(() => document.querySelectorAll('.subtabs').forEach(el => slide(el, el.querySelector('.subInk'), el.querySelector('[aria-selected=true]'))), 100));

/* ── números que sobem ── */
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export function countUp(root = document) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = +el.dataset.count, from = +(el.dataset.from || 0); el.removeAttribute('data-count');
    if (reduced || to === from) { el.textContent = n(to); return; }
    const t0 = performance.now(), d = 700;
    const step = t => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = n(Math.round(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}

/* ── pessoas: cor e iniciais ── */
const COLORS = ['#345AFA', '#C31634', '#DA1476', '#E79C2A', '#8a3dff', '#D94BFA', '#0fb8c9'];
export const personColor = id => COLORS[(Number(id) || 0) % COLORS.length];
export const initials = name => (String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase();

/* ── preferências deste aparelho ── */
export const prefs = {
  get(k, d) { try { const v = localStorage.getItem('hm-pref-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('hm-pref-' + k, JSON.stringify(v)); } catch {} },
};
export function applyPrefs() {
  document.documentElement.classList.toggle('calm', !!prefs.get('calm', false));
  document.documentElement.classList.toggle('big', !!prefs.get('big', false));
}
applyPrefs();
