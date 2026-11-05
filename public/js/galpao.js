/* Galpão: planta clicável. Cada estante mostra suas fotos e as peças guardadas nela. */
import { $, $$, esc, fold, n, icon, api, toast, zoom, blobUrl } from './core.js';
import { state, patch, subscribe } from './state.js';
import { SHELVES, shelf, shelfOptions } from './shelves.js';
import { openDetail } from './estoque.js';

let sel = null, inited = false, q = '';
const items = id => state.products.filter(p => (p.location || '') === id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const units = list => list.reduce((a, p) => a + (p.unit === 'un' ? p.quantity : 0), 0);

/* no celular a planta gira 90° para ocupar a tela em pé */
const portrait = () => innerWidth < 640;
const R = (x, y, w, h) => portrait() ? { x: 640 - y - h, y: x, w: h, h: w } : { x, y, w, h };

function plan() {
  const counts = Object.fromEntries(SHELVES.map(s => [s.id, items(s.id).length]));
  const hits = q ? new Set(state.products.filter(p => p._s.includes(q) && p.location).map(p => p.location)) : null;
  const sh = SHELVES.map((s0, i) => {
    const s = R(s0.x, s0.y, s0.w, s0.h), cx = s.x + s.w / 2, cy = s.y + s.h / 2, wide = s.w > s.h;
    const m = Math.max(2, Math.round((wide ? s.w : s.h) / 62));
    const lines = Array.from({ length: m }, (_, k) => (k + 1) / (m + 1)).filter(f => Math.abs(f - .5) * (wide ? s.w : s.h) > (wide ? 60 : 0)).map(f => wide
      ? `<line x1="${s.x + s.w * f}" y1="${s.y + 8}" x2="${s.x + s.w * f}" y2="${s.y + s.h - 8}"/>`
      : `<line x1="${s.x + 8}" y1="${s.y + s.h * f}" x2="${s.x + s.w - 8}" y2="${s.y + s.h * f}"/>`).join('');
    const cls = ['sh', sel === s0.id ? 'on' : '', hits ? (hits.has(s0.id) ? 'hit' : 'dim') : ''].join(' ');
    return `<g class="${cls}" data-shelf="${s0.id}" style="--c:${s0.c};--i:${i}" tabindex="0" role="button" aria-label="Estante ${s0.id}: ${esc(s0.name)}, ${counts[s0.id]} peças">
      <rect class="body" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="10"/>${lines}
      <circle class="tagc" cx="${cx}" cy="${wide ? cy : cy - 14}" r="22"/>
      <text class="letter" x="${cx}" y="${wide ? cy : cy - 14}">${s0.id}</text>
      <text class="cnt" x="${wide ? cx + 32 : cx}" y="${wide ? cy : cy + 26}" text-anchor="${wide ? 'start' : 'middle'}">${counts[s0.id]}</text>
    </g>`;
  }).join('');
  const box = (cls, x, y, w, h, rx) => { const r = R(x, y, w, h); return `<rect class="${cls}" x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="${rx}"/>`; };
  const pal = R(700, 500, 160, 96), dl = R(500, 610, 0, 0), pt = portrait();
  return `<svg viewBox="0 0 ${pt ? '640 1000' : '1000 640'}" class="planSvg" role="img" aria-label="Planta do galpão">
    <defs><pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="10"/></pattern></defs>
    ${box('room', 8, 8, 984, 624, 22)}${box('pallet', 700, 500, 160, 96, 10)}
    <text class="lbl" x="${pal.x + pal.w / 2}" y="${pal.y + pal.h / 2}">caixas</text>
    ${box('island', 282, 160, 184, 306, 14)}${box('door', 440, 626, 120, 6, 3)}
    <text class="lbl" x="${dl.x + (pt ? 22 : 0)}" y="${dl.y}"${pt ? ` transform="rotate(90 ${dl.x + 22} ${dl.y})"` : ''}>entrada</text>
    ${sh}</svg>`;
}

function row(p) {
  return `<li class="shItem"><button class="shOpen" data-pid="${p.id}"><span class="th">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : icon('box')}</span>
    <span class="tx"><b>${esc(p.name)}</b><small>${esc(p.category || 'Sem categoria')} · #${p.id}</small></span><em>${p.review_status === 'pendente' && !p.quantity ? '?' : n(p.quantity)}</em></button>
    <label class="mv" title="Mudar de estante"><span class="sr">Estante de ${esc(p.name)}</span>${icon('pin')}<select data-loc="${p.id}">${shelfOptions(p.location || '')}</select></label></li>`;
}

function side() {
  const el = $('#shelfPanel');
  if (sel === null) {
    const loose = items('').length;
    el.innerHTML = `<div class="shHead"><span class="shBadge" style="--c:var(--white)">${icon('pin')}</span><div><h2>Toque numa estante</h2><p class="muted">Cada estante mostra as fotos e as peças guardadas nela.</p></div></div>
      <ul class="legend">${SHELVES.map(s => `<li><button data-shelf="${s.id}" style="--c:${s.c}"><i>${s.id}</i><span>${esc(s.name)}</span><small>${items(s.id).length}</small></button></li>`).join('')}</ul>
      ${loose ? `<button class="btn sm loose" data-shelf="">${icon('box')}${loose} peças ainda sem estante</button>` : ''}`;
    return;
  }
  const s = shelf(sel), list = items(sel);
  el.innerHTML = `<div class="shHead"><span class="shBadge" style="--c:${s ? s.c : 'var(--ink-3)'}">${s ? s.id : '?'}</span><div><h2>${s ? esc(s.name) : 'Peças sem estante'}</h2>
      <p class="muted">${list.length} ${list.length === 1 ? "tipo" : "tipos"} de peça${units(list) ? ` · ${n(units(list))} unidades` : ''}</p></div><button class="x" data-back aria-label="Voltar à planta">${icon('x')}</button></div>
    ${s ? `<button class="shHero" data-photo="${s.id}1" aria-label="Ampliar foto da estante ${s.id}"><img alt="Estante ${s.id}" data-src="/api/galpao/${s.id}1.jpg"><span>${icon('photo')}${s.photos} fotos</span></button>
      <div class="shPhotos">${Array.from({ length: s.photos }, (_, k) => `<button data-hero="${s.id}${k + 1}" aria-label="Foto ${k + 1} da estante ${s.id}"${k ? '' : ' aria-current="true"'}><img alt="" data-src="/api/galpao/t${s.id}${k + 1}.jpg"></button>`).join('')}</div>` : '<p class="muted">Escolha a estante de cada peça no seletor ao lado dela.</p>'}
    <ul class="shList">${list.map(row).join('') || '<li class="muted empty1">Nenhuma peça marcada nesta estante ainda. Abra uma peça e escolha a estante dela.</li>'}</ul>`;
  $$('img[data-src]', el).forEach(img => blobUrl(img.dataset.src).then(u => { img.src = u; img.closest('button').classList.add('ok'); }).catch(() => img.closest('button').classList.add('fail')));
}

function finder() {
  const box = $('#gFound');
  if (!q) { box.innerHTML = ''; box.hidden = true; return; }
  const found = state.products.filter(p => p._s.includes(q)).slice(0, 6);
  box.hidden = false;
  box.innerHTML = found.map(p => { const s = shelf(p.location); return `<button data-pid="${p.id}" data-go="${p.location || ''}"><span class="shBadge sm" style="--c:${s ? s.c : 'var(--ink-3)'}">${s ? s.id : '?'}</span><span class="tx"><b>${esc(p.name)}</b><small>${s ? 'Estante ' + s.id + ' · ' + esc(s.name) : 'Ainda sem estante'}</small></span></button>`; }).join('')
    || `<p class="muted">Nada encontrado.</p>`;
}

export function render() {
  if ($('#v-galpao').hidden) return;
  $('#plan').innerHTML = plan(); side(); finder();
}
function pick(id) { sel = id; render(); if (innerWidth < 900) $('#shelfPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

export async function setLocation(pid, loc) {
  try {
    await api(`/api/products/${pid}/location`, { json: { location: loc } });
    patch(pid, { location: loc }); toast(loc ? `Guardada na estante ${loc}` : 'Peça sem estante');
  } catch (e) { toast(e.message, true); render(); }
}

export function init() {
  if (inited) return; inited = true;
  subscribe(render);
  const v = $('#v-galpao');
  v.addEventListener('click', e => {
    const th = e.target.closest('[data-hero]');
    if (th) {
      const h = $('.shHero'), img = h.querySelector('img'); h.dataset.photo = th.dataset.hero; h.classList.remove('ok');
      blobUrl(`/api/galpao/${th.dataset.hero}.jpg`).then(u => { img.src = u; h.classList.add('ok'); }).catch(err => toast(err.message, true));
      $$('[data-hero]').forEach(x => x.toggleAttribute('aria-current', x === th)); return;
    }
    const ph = e.target.closest('[data-photo]'); if (ph) { blobUrl(`/api/galpao/${ph.dataset.photo}.jpg`).then(u => zoom(u, shelf(ph.dataset.photo[0])?.name || '')).catch(err => toast(err.message, true)); return; }
    if (e.target.closest('[data-back]')) return pick(null);
    const found = e.target.closest('#gFound [data-pid]');
    if (found) { q = ''; $('#gQ').value = ''; pick(found.dataset.go); requestAnimationFrame(() => $(`.shOpen[data-pid="${found.dataset.pid}"]`)?.classList.add('flash')); return; }
    const op = e.target.closest('.shOpen'); if (op) return openDetail(+op.dataset.pid);
    const sh = e.target.closest('[data-shelf]'); if (sh) return pick(sh.dataset.shelf);
  });
  v.addEventListener('keydown', e => { const sh = e.target.closest('g[data-shelf]'); if (sh && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(sh.dataset.shelf); } });
  v.addEventListener('change', e => { const s = e.target.closest('select[data-loc]'); if (s) setLocation(+s.dataset.loc, s.value); });
  $('#gQ').addEventListener('input', e => { q = fold(e.target.value.trim()); $('#plan').innerHTML = plan(); finder(); });
}
export function load() { init(); render(); }
let wasPortrait = portrait();
addEventListener('resize', () => { if (portrait() !== wasPortrait) { wasPortrait = portrait(); render(); } });
