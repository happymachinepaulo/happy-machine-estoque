/* Galpão em 3D: as estantes ficam de pé no chão, com as fotos de cada uma nas laterais.
   Arraste para girar, role ou use os botões para aproximar. Tocar numa estante abre as fotos
   com as peças marcadas: peça cadastrada abre a ficha; peça sem cadastro abre o cadastro com o recorte da foto. */
import { $, $$, esc, fold, n, icon, api, toast, open, blobUrl } from './core.js';
import { state, patch, subscribe } from './state.js';
import { SHELVES, shelf, shelfOptions } from './shelves.js';
import { SPOTS } from './spots.js';
import { openDetail, newWithCrop } from './estoque.js';

let sel = null, inited = false, q = '';
/* no celular em pé a planta começa girada para o lado comprido ficar na vertical */
const home = () => ({ rx: 52, rz: innerWidth < 640 ? -82 : -8, k: 1 });
const cam = home();
const items = id => state.products.filter(p => (p.location || '') === id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const units = list => list.reduce((a, p) => a + (p.unit === 'un' ? p.quantity : 0), 0);
const byId = id => state.products.find(p => p.id === id);

/* ── cena 3D (CSS 3D: cada estante é uma caixa com 5 faces) ── */
// face de pé: base do ponto (x0,y0) na direção a (graus), comprimento L, altura H
const wall = (cls, x0, y0, a, L, H, extra = '') => `<div class="fc ${cls}" style="width:${L}px;height:${H}px;transform:translate3d(${x0}px,${y0 - H}px,0) rotateZ(${a}deg) rotateX(-90deg)"${extra}></div>`;
function box(s, i) {
  const { x, y, w, h } = s, H = s.hgt || 140, photo = k => k <= s.photos ? ` data-tex="${s.id}${k}"` : '';
  const sides = { s: [0, h, 0, w], n: [w, 0, 180, w], e: [w, h, -90, h], w: [0, 0, 90, h] };
  const opp = { s: 'n', n: 's', e: 'w', w: 'e' }[s.face];
  const faces = Object.entries(sides).map(([k, [x0, y0, a, L]]) => wall('side ' + k + (k === s.face ? ' front' : ''), x0, y0, a, L, H, k === s.face ? photo(1) : k === opp ? photo(2) : '')).join('');
  return `<div class="bx" data-shelf="${s.id}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px;--c:${s.c};--i:${i};--H:${H}px" tabindex="0" role="button" aria-label="Estante ${s.id}: ${esc(s.name)}">
    ${faces}<div class="fc top" style="width:${w}px;height:${h}px;transform:translateZ(${H}px)"><b>${s.id}</b><small>${items(s.id).length}</small></div></div>`;
}
function scene() {
  return `<div class="scene" id="scene" aria-label="Galpão em 3D. Arraste para girar.">
    <div class="world" id="world">
      <div class="floor"><span class="door">entrada</span><span class="pallet">caixas embaladas</span></div>
      ${SHELVES.map(box).join('')}
    </div>
    <div class="camBtns"><button class="btn icon sm" data-cam="in" aria-label="Aproximar">${icon('plus')}</button><button class="btn icon sm" data-cam="out" aria-label="Afastar">${icon('minus')}</button><button class="btn icon sm" data-cam="reset" aria-label="Voltar à vista inicial">${icon('back')}</button></div>
    <p class="camHint">${icon('arrow')}Arraste para girar · toque numa estante</p>
  </div>`;
}
function fit() {
  const sc = $('#scene'), w = $('#world'); if (!sc || !w) return;
  const tall = innerWidth < 640;
  const base = tall ? Math.min(sc.clientWidth / 740, sc.clientHeight / 980) : Math.min(sc.clientWidth / 1080, sc.clientHeight / 560);
  w.style.transform = `translate(-50%,-50%) scale(${base * cam.k}) rotateX(${cam.rx}deg) rotateZ(${cam.rz}deg)`;
}
function marks() {
  const hits = q ? new Set(state.products.filter(p => p._s.includes(q) && p.location).map(p => p.location)) : null;
  $$('#world .bx').forEach(b => { b.classList.toggle('on', b.dataset.shelf === sel); b.classList.toggle('hit', !!hits?.has(b.dataset.shelf)); b.classList.toggle('dim', !!hits && !hits.has(b.dataset.shelf)); b.querySelector('.top small').textContent = items(b.dataset.shelf).length; });
}
function textures() {
  $$('#world [data-tex]').forEach(f => blobUrl(`/api/galpao/t${f.dataset.tex}.jpg`).then(u => { f.style.backgroundImage = `url("${u}")`; f.classList.add('ok'); }).catch(() => {}));
}
function drag(sc) {
  let p = null, moved = 0;
  const pts = new Map();
  sc.addEventListener('pointerdown', e => { if (e.target.closest('.camBtns')) return; pts.set(e.pointerId, e); p = { x: e.clientX, y: e.clientY, rx: cam.rx, rz: cam.rz, k: cam.k, d: null }; moved = 0; sc.setPointerCapture(e.pointerId); });
  sc.addEventListener('pointermove', e => {
    if (!p || !pts.has(e.pointerId)) return; pts.set(e.pointerId, e);
    if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); p.d ??= d; cam.k = Math.min(2.6, Math.max(.6, p.k * d / p.d)); moved = 99; fit(); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; moved = Math.max(moved, Math.hypot(dx, dy));
    cam.rz = p.rz - dx * .35; cam.rx = Math.min(78, Math.max(20, p.rx - dy * .25)); fit();
  });
  const up = e => {
    pts.delete(e.pointerId);
    if (!pts.size) {
      if (p && moved < 6) { const b = document.elementsFromPoint(e.clientX, e.clientY).map(el => el.closest?.('.bx')).find(Boolean); if (b) pick(b.dataset.shelf, true); }
      p = null;
    }
  };
  sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', e => { pts.delete(e.pointerId); p = null; });
  sc.addEventListener('wheel', e => { e.preventDefault(); cam.k = Math.min(2.6, Math.max(.6, cam.k * (e.deltaY < 0 ? 1.1 : .9))); fit(); }, { passive: false });
}

/* ── painel lateral ── */
function row(p) {
  return `<li class="shItem"><button class="shOpen" data-pid="${p.id}"><span class="th">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : icon('box')}</span>
    <span class="tx"><b>${esc(p.name)}</b><small>${esc(p.category || 'Sem categoria')} · #${p.id}</small></span><em>${p.review_status === 'pendente' && !p.quantity ? '?' : n(p.quantity)}</em></button>
    <label class="mv" title="Mudar de estante"><span class="sr">Estante de ${esc(p.name)}</span>${icon('pin')}<select data-loc="${p.id}">${shelfOptions(p.location || '')}</select></label></li>`;
}
function side() {
  const el = $('#shelfPanel');
  if (sel === null) {
    const loose = items('').length;
    el.innerHTML = `<div class="shHead"><span class="shBadge" style="--c:var(--white)">${icon('pin')}</span><div><h2>Toque numa estante</h2><p class="muted">Abre as fotos dela. Toque numa peça marcada na foto para ir até ela no estoque.</p></div></div>
      <ul class="legend">${SHELVES.map(s => `<li><button data-shelf="${s.id}" style="--c:${s.c}"><i>${s.id}</i><span>${esc(s.name)}</span><small>${items(s.id).length}</small></button></li>`).join('')}</ul>
      ${loose ? `<button class="btn sm loose" data-shelf="">${icon('box')}${loose} peças ainda sem estante</button>` : ''}`;
    return;
  }
  const s = shelf(sel), list = items(sel), spots = s ? Array.from({ length: s.photos }, (_, k) => SPOTS[s.id + (k + 1)] || []).flat() : [];
  const missing = [...new Map(spots.filter(x => !x.id || !byId(x.id)).map(x => [x.name, x])).values()];
  el.innerHTML = `<div class="shHead"><span class="shBadge" style="--c:${s ? s.c : 'var(--ink-3)'}">${s ? s.id : '?'}</span><div><h2>${s ? esc(s.name) : 'Peças sem estante'}</h2>
      <p class="muted">${list.length} ${list.length === 1 ? 'tipo' : 'tipos'} de peça${units(list) ? ` · ${n(units(list))} unidades` : ''}</p></div><button class="x" data-back aria-label="Voltar">${icon('x')}</button></div>
    ${s ? `<button class="shHero" data-view="${s.id}1" aria-label="Abrir fotos da estante ${s.id} com as peças marcadas"><img alt="Estante ${s.id}" data-src="/api/galpao/${s.id}1.jpg"><span>${icon('photo')}${s.photos} fotos · peças marcadas</span></button>
      <div class="shPhotos">${Array.from({ length: s.photos }, (_, k) => `<button data-view="${s.id}${k + 1}" aria-label="Foto ${k + 1} da estante ${s.id}"><img alt="" data-src="/api/galpao/t${s.id}${k + 1}.jpg"></button>`).join('')}</div>` : '<p class="muted">Escolha a estante de cada peça no seletor ao lado dela.</p>'}
    <ul class="shList">${list.map(row).join('') || '<li class="muted empty1">Nenhuma peça marcada nesta estante ainda.</li>'}</ul>
    ${missing.length ? `<div class="miss"><p><b>Vistas na foto, sem cadastro</b><small>Toque para cadastrar.</small></p>${missing.map(x => `<button class="chipNew" data-new="${esc(x.name)}">${icon('plus')}${esc(x.name)}</button>`).join('')}</div>` : ''}`;
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

/* ── fotos com as peças marcadas ── */
let vw = null;
function viewer(key) {
  const s = shelf(key[0]), k = +key.slice(1); vw = { s, k, key };
  const spots = SPOTS[key] || [];
  $('#vsBadge').textContent = s.id; $('#vsBadge').style.setProperty('--c', s.c); $('#vsName').textContent = s.name;
  $('#vsSub').textContent = `Foto ${k} de ${s.photos} · ${spots.length ? `${spots.length} peças marcadas` : 'sem peças marcadas'}`;
  const img = $('#vsImg'); img.removeAttribute('src'); $('#vsStage').classList.remove('ok'); $('#vsPop').hidden = true;
  blobUrl(`/api/galpao/${key}.jpg`).then(u => { if (vw?.key !== key) return; img.src = u; (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(() => $('#vsStage').classList.add('ok')); }).catch(e => toast(e.message, true));
  $('#vsSpots').innerHTML = spots.map((x, i) => { const p = x.id && byId(x.id); return `<button class="spot ${p ? 'has' : 'new'}" data-i="${i}" style="left:${x.x}%;top:${x.y}%;width:${x.w}%;height:${x.h}%;--d:${i * 70}ms" aria-label="${esc(p ? p.name : x.name)}${p ? '' : ' (sem cadastro)'}"><span>${icon(p ? 'box' : 'plus')}${esc(p ? p.name : x.name)}${p ? `<em>${p.review_status === 'pendente' && !p.quantity ? '?' : n(p.quantity)}</em>` : ''}</span></button>`; }).join('');
  $('#vsThumbs').innerHTML = Array.from({ length: s.photos }, (_, j) => `<button data-k="${s.id}${j + 1}" aria-current="${j + 1 === k}"><img alt="Foto ${j + 1}" data-src="/api/galpao/t${s.id}${j + 1}.jpg"></button>`).join('');
  $$('#vsThumbs img').forEach(im => blobUrl(im.dataset.src).then(u => im.src = u).catch(() => {}));
  open($('#dShelf'));
}
async function crop(x) {
  const img = $('#vsImg'), W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas');
  const sx = W * x.x / 100, sy = H * x.y / 100, sw = Math.max(8, W * x.w / 100), sh = Math.max(8, H * x.h / 100);
  c.width = Math.round(sw); c.height = Math.round(sh); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .88));
  return new File([b], 'recorte.jpg', { type: 'image/jpeg' });
}
function spotClick(i) {
  const x = (SPOTS[vw.key] || [])[i]; if (!x) return;
  const p = x.id && byId(x.id);
  if (p) { $('#dShelf').close(); openDetail(p.id); return; }
  const pop = $('#vsPop'); pop.hidden = false; pop.dataset.i = i;
  $('#vsPopName').textContent = x.name;
  pop.style.left = Math.min(62, Math.max(2, x.x)) + '%'; pop.style.top = Math.min(74, x.y + x.h) + '%';
}
async function registerSpot(x, fromViewer) {
  let file = null;
  try { if (fromViewer) file = await crop(x); } catch {}
  const loc = vw?.s.id || sel || '';
  if (fromViewer) $('#dShelf').close();
  newWithCrop(file, { name: x.name, location: loc });
}

export function render() {
  if ($('#v-galpao').hidden) return;
  if (!$('#scene')) { $('#plan').innerHTML = scene(); drag($('#scene')); textures(); }
  requestAnimationFrame(fit); marks(); side(); finder();
}
function pick(id, fromScene) { sel = id; marks(); side(); if (fromScene && innerWidth < 900) $('#shelfPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); }

export async function setLocation(pid, loc) {
  try {
    await api(`/api/products/${pid}/location`, { json: { location: loc } });
    patch(pid, { location: loc }); toast(loc ? `Guardada na estante ${loc}` : 'Peça sem estante');
  } catch (e) { toast(e.message, true); render(); }
}

export function init() {
  if (inited) return; inited = true;
  subscribe(() => { if (!$('#v-galpao').hidden) { marks(); side(); finder(); } });
  const v = $('#v-galpao');
  v.addEventListener('click', e => {
    const cb = e.target.closest('[data-cam]');
    if (cb) { const a = cb.dataset.cam; if (a === 'reset') Object.assign(cam, home()); else cam.k = Math.min(2.6, Math.max(.6, cam.k * (a === 'in' ? 1.2 : .83))); fit(); return; }
    const vb = e.target.closest('[data-view]'); if (vb) return viewer(vb.dataset.view);
    const nw = e.target.closest('[data-new]'); if (nw) return registerSpot({ name: nw.dataset.new }, false);
    if (e.target.closest('[data-back]')) return pick(null);
    const found = e.target.closest('#gFound [data-pid]');
    if (found) { q = ''; $('#gQ').value = ''; pick(found.dataset.go); finder(); requestAnimationFrame(() => $(`.shOpen[data-pid="${found.dataset.pid}"]`)?.classList.add('flash')); return; }
    const op = e.target.closest('.shOpen'); if (op) return openDetail(+op.dataset.pid);
    const sh = e.target.closest('.legend [data-shelf], .loose'); if (sh) return pick(sh.dataset.shelf);
  });
  v.addEventListener('keydown', e => { const b = e.target.closest('.bx'); if (b && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pick(b.dataset.shelf); } });
  v.addEventListener('change', e => { const s = e.target.closest('select[data-loc]'); if (s) setLocation(+s.dataset.loc, s.value); });
  $('#gQ').addEventListener('input', e => { q = fold(e.target.value.trim()); marks(); finder(); });
  $('#dShelf').addEventListener('click', e => {
    const t = e.target.closest('[data-k]'); if (t) return viewer(t.dataset.k);
    const sp = e.target.closest('.spot'); if (sp) return spotClick(+sp.dataset.i);
    if (e.target.closest('#vsReg')) return registerSpot((SPOTS[vw.key] || [])[+$('#vsPop').dataset.i], true);
    if (e.target.closest('#vsPopX')) { $('#vsPop').hidden = true; return; }
    if (e.target.closest('#vsPrev, #vsNext')) { const d = e.target.closest('#vsNext') ? 1 : -1, k = (vw.k - 1 + d + vw.s.photos) % vw.s.photos + 1; viewer(vw.s.id + k); }
  });
  $('#dShelf').addEventListener('keydown', e => { if (e.key === 'ArrowRight') $('#vsNext').click(); if (e.key === 'ArrowLeft') $('#vsPrev').click(); });
  addEventListener('resize', fit);
}
export function load() { init(); render(); }
