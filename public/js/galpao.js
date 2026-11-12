/* Galpão: duas formas de ver o estoque, alternadas no topo da aba.
   3D: a sala montada a partir das fotos (galpao3d.js), com produto localizado, rota da porta até a estante e divergência
   (peças abaixo do mínimo em vermelho). Foto real: a foto panorâmica do estoque. Passar o dedo ou o mouse destaca a estante; tocar nela
   faz a câmera "entrar" na foto geral até a estante e troca para a foto de perto, com as peças marcadas.
   Peça cadastrada abre a ficha; peça sem cadastro abre o cadastro com o recorte da foto.
   O administrador pode redesenhar onde cada estante está no panorama (botão Ajustar). */
import { $, $$, esc, fold, n, icon, api, toast, blobUrl, fmtDate } from './core.js';
import { state, patch, subscribe } from './state.js';
import { SHELVES, PANO, PANO_RATIO, shelf, shelfOptions } from './shelves.js';
import { SPOTS } from './spots.js';
import { openDetail, newWithCrop } from './estoque.js';

let sel = null, inited = false, q = '', layout = PANO, zoom = 1, busy = false;
let shot = null;          // { s, k, key } foto aberta
let mode = '3d', G3 = null, g3mode = 'geral', card = null;   // card = { kind: 'shelf'|'prod'|'div', id, pid, meters }
try { mode = localStorage.getItem('hm-galpao') === 'foto' ? 'foto' : '3d'; } catch {}
const isPending = p => p.review_status === 'pendente';
const isLow = p => !isPending(p) && p.min_quantity > 0 && p.quantity <= p.min_quantity;
const lowBy = () => state.products.filter(p => p.location && isLow(p)).reduce((a, p) => ((a[p.location] = (a[p.location] || 0) + 1), a), {});
const unitOf = p => p.unit === 'm' ? 'm' : p.unit === 'lote' ? 'lote' : 'un';
let edit = null;          // { id, rects } modo de ajuste
const items = id => state.products.filter(p => (p.location || '') === id).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
const units = list => list.reduce((a, p) => a + (p.unit === 'un' ? p.quantity : 0), 0);
const byId = id => state.products.find(p => p.id === id);
const rects = id => (edit ? edit.rects : layout)[id] || [];
const calm = () => document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const admin = () => state.me?.role === 'admin';
const qty = p => p.review_status === 'pendente' && !p.quantity ? '?' : n(p.quantity);

/* ── panorama ── */
function stage() {
  if (mode === '3d') return `<div class="pv g3on" id="pv">
    <div class="g3" id="g3"><div class="g3Load" id="g3Load"><span></span>Montando o galpão em 3D…</div></div>
    <div class="g3Tags" id="g3Tags"></div>
    <div class="g3Kpi" id="g3Kpi"></div>
    <div class="g3Card" id="g3Card" hidden></div>
    <div class="pvShot" id="pvShot" hidden></div>
    <div class="pvBar" id="pvBar"></div>
  </div>
  <div class="pvChips" id="pvChips"></div>`;
  return `<div class="pv" id="pv">
    <div class="pvScroll" id="pvScroll"><div class="pvIn" id="pvIn" style="--ar:${PANO_RATIO}">
      <img id="pvImg" alt="Foto panorâmica do galpão" draggable="false">
      <svg class="pvSvg" id="pvSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path class="pvShade" id="pvShade" fill-rule="evenodd"/><g id="pvBoxes"></g></svg>
      <div class="pvTags" id="pvTags"></div>
    </div></div>
    <div class="pvShot" id="pvShot" hidden></div>
    <div class="pvBar" id="pvBar"></div>
  </div>
  <div class="pvChips" id="pvChips"></div>`;
}
function bar() {
  const b = $('#pvBar'); if (!b) return;
  if (edit) {
    b.className = 'pvBar edit';
    b.innerHTML = `<span class="pvHint">${icon('edit')}Escolha a estante e arraste na foto para marcar onde ela está.</span>
      <div class="pvLetters">${SHELVES.map(s => `<button data-ed="${s.id}" style="--c:${s.c}" aria-pressed="${edit.id === s.id}">${s.id}<small>${(edit.rects[s.id] || []).length || ''}</small></button>`).join('')}</div>
      <div class="pvActs"><button class="btn sm" data-edclear>${icon('trash')}Limpar ${edit.id}</button><button class="btn sm" data-edcancel>Cancelar</button><button class="btn sm primary" data-edsave>${icon('check')}Salvar</button></div>`;
    return;
  }
  b.className = 'pvBar';
  if (mode === '3d') {
    const low = Object.values(lowBy()).reduce((a, v) => a + v, 0);
    b.innerHTML = `<span class="pvHint">${icon('arrow')}Arraste para girar · pinça ou rodinha para aproximar · toque numa estante</span>
      <div class="pvActs"><button class="btn sm ghost" data-g3="geral" aria-pressed="${g3mode === 'geral' && !card}">${icon('map')}Visão geral</button>
      <button class="btn sm ghost g3Div" data-g3="divergencia" aria-pressed="${g3mode === 'divergencia'}">${icon('bell')}Divergência${low ? `<small>${low}</small>` : ''}</button></div>`;
    return;
  }
  b.innerHTML = `<span class="pvHint">${icon('arrow')}Arraste para olhar o galpão · toque numa estante</span>
    <div class="pvActs">${admin() ? `<button class="btn sm ghost" data-edit title="Marcar onde cada estante está na foto">${icon('edit')}Ajustar</button>` : ''}
    <button class="btn icon sm" data-z="in" aria-label="Aproximar">${icon('plus')}</button><button class="btn icon sm" data-z="out" aria-label="Afastar">${icon('minus')}</button></div>`;
}
function hits() { return q ? new Set(state.products.filter(p => p._s.includes(q) && p.location).map(p => p.location)) : null; }
function boxes() {
  if (mode === '3d') return paint3d();
  const h = hits(), all = SHELVES.filter(s => rects(s.id).length);
  $('#pvBoxes').innerHTML = all.map(s => rects(s.id).map(([x, y, w, hh]) => `<rect class="pvBox${sel === s.id ? ' on' : ''}${h?.has(s.id) ? ' hit' : ''}${edit && edit.id === s.id ? ' ed' : ''}" data-shelf="${s.id}" x="${x}" y="${y}" width="${w}" height="${hh}" rx=".6" style="--c:${s.c}"/>`).join('')).join('');
  $('#pvTags').innerHTML = all.map(s => {
    const [x, y, w] = rects(s.id).reduce((a, r) => (r[2] * r[3] > a[2] * a[3] ? r : a));
    return `<button class="pvTag${sel === s.id ? ' on' : ''}${h ? (h.has(s.id) ? ' hit' : ' dim') : ''}" data-shelf="${s.id}" style="--c:${s.c};left:${x + w / 2}%;top:${y}%" aria-label="Estante ${s.id}: ${esc(s.name)}, ${items(s.id).length} peças"><b>${s.id}</b><span>${esc(s.name)}</span><small>${items(s.id).length}</small></button>`;
  }).join('');
  shade(h ? [...h] : sel ? [sel] : []);
}
/* escurece a foto toda menos as estantes destacadas */
function shade(ids) {
  const p = $('#pvShade'); if (!p || mode === '3d') return;
  const holes = ids.flatMap(id => rects(id)).map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}Z`).join('');
  p.setAttribute('d', holes ? 'M0 0H100V100H0Z' + holes : '');
  p.classList.toggle('show', !!holes);
}
function chips() {
  const el = $('#pvChips'); if (!el) return;
  const loose = items('').length;
  const has = id => mode === '3d' || rects(id).length;
  el.innerHTML = SHELVES.map(s => `<button data-shelf="${s.id}" style="--c:${s.c}" aria-pressed="${sel === s.id}" class="${has(s.id) ? '' : 'off'}" title="${has(s.id) ? '' : 'Esta estante não aparece na foto geral'}"><i>${s.id}</i><span>${esc(s.name)}</span><small>${items(s.id).length}</small></button>`).join('')
    + (loose ? `<button data-shelf="" class="loose" aria-pressed="${sel === ''}"><i>?</i><span>Sem estante</span><small>${loose}</small></button>` : '');
}
function sizePano() {
  const sc = $('#pvScroll'), inn = $('#pvIn'); if (!sc || !inn) return;
  inn.style.height = sc.clientHeight * zoom + 'px';
}
function centerOn(xPct, yPct) {
  const sc = $('#pvScroll'), inn = $('#pvIn');
  sc.scrollLeft = inn.offsetWidth * xPct / 100 - sc.clientWidth / 2; sc.scrollTop = inn.offsetHeight * yPct / 100 - sc.clientHeight / 2;
}

/* arrastar com o mouse para olhar (no toque o próprio navegador rola) e desenhar no modo Ajustar */
function pointer() {
  const sc = $('#pvScroll'), inn = $('#pvIn');
  let p = null;
  const pct = e => { const r = inn.getBoundingClientRect(); return [Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)), Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100))]; };
  sc.addEventListener('pointerdown', e => {
    if (e.button) return;
    if (edit) { e.preventDefault(); sc.setPointerCapture(e.pointerId); p = { draw: pct(e), el: null }; return; }
    if (e.pointerType !== 'mouse') return;
    p = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop, moved: 0 };
  });
  sc.addEventListener('pointermove', e => {
    if (!p) {
      if (edit || e.pointerType !== 'mouse') return;
      const t = e.target.closest?.('[data-shelf]'); const id = t ? t.dataset.shelf : null;
      if (!q && sel === null) shade(id ? [id] : []);
      $$('#pvTags .pvTag').forEach(b => b.classList.toggle('hov', b.dataset.shelf === id));
      return;
    }
    if (p.draw) {
      const [a, b] = p.draw, [c, d] = pct(e);
      p.r = [Math.min(a, c), Math.min(b, d), Math.abs(c - a), Math.abs(d - b)];
      if (!p.el) { p.el = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); p.el.setAttribute('class', 'pvBox draft'); p.el.style.setProperty('--c', shelf(edit.id).c); $('#pvBoxes').append(p.el); }
      [['x', 0], ['y', 1], ['width', 2], ['height', 3]].forEach(([k, i]) => p.el.setAttribute(k, p.r[i]));
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.moved = Math.max(p.moved, Math.hypot(dx, dy));
    if (p.moved > 4) { sc.classList.add('grab'); sc.scrollLeft = p.l - dx; sc.scrollTop = p.t - dy; }
  });
  const up = () => {
    if (p?.draw && p.r && p.r[2] > 1 && p.r[3] > 1) {
      const list = edit.rects[edit.id] = [...(edit.rects[edit.id] || []), p.r.map(v => Math.round(v * 100) / 100)].slice(-4);
      if (list.length) { boxes(); bar(); }
    } else if (p?.draw) boxes();
    if (p && !p.draw && p.moved > 4) { sc.dataset.drag = '1'; setTimeout(() => delete sc.dataset.drag, 0); }
    sc.classList.remove('grab'); p = null;
  };
  sc.addEventListener('pointerup', up); sc.addEventListener('pointercancel', up);
  sc.addEventListener('pointerleave', () => { if (!p && !q && sel === null && !edit) shade([]); });
  sc.addEventListener('wheel', e => { if (!e.ctrlKey) return; e.preventDefault(); setZoom(e.deltaY < 0 ? 1.25 : .8); }, { passive: false });
}
function setZoom(f) {
  const sc = $('#pvScroll'), inn = $('#pvIn');
  const cx = (sc.scrollLeft + sc.clientWidth / 2) / inn.offsetWidth * 100, cy = (sc.scrollTop + sc.clientHeight / 2) / inn.offsetHeight * 100;
  zoom = Math.min(2.6, Math.max(1, zoom * f)); sizePano(); centerOn(cx, cy);
}

/* ── transição: entra na foto geral até a estante e troca para a foto dela ── */
function bbox(id) {
  const r = rects(id); if (!r.length) return null;
  const x0 = Math.min(...r.map(a => a[0])), y0 = Math.min(...r.map(a => a[1])), x1 = Math.max(...r.map(a => a[0] + a[2])), y1 = Math.max(...r.map(a => a[1] + a[3]));
  return [x0, y0, x1 - x0, y1 - y0];
}
function zoomIn(id) {
  const pv = $('#pv'), sc = $('#pvScroll'), inn = $('#pvIn'), b = bbox(id);
  $('#pvZoom')?.remove();
  if (!b) return Promise.resolve(null);
  const W = sc.clientWidth, H = sc.clientHeight, iw = inn.offsetWidth, ih = inn.offsetHeight;
  const bx = iw * b[0] / 100, by = ih * b[1] / 100, bw = iw * b[2] / 100, bh = ih * b[3] / 100;
  const s = Math.max(Math.min(Math.max(Math.min(W / bw, H / bh) * .92, Math.max(W / bw, H / bh) * .7), 3.2), W / iw, H / ih);
  const clamp = (v, lo) => Math.min(0, Math.max(lo, v));          // a foto sempre cobre a tela, sem faixa preta
  const tx = clamp(W / 2 - (bx + bw / 2) * s, W - iw * s), ty = clamp(H / 2 - (by + bh / 2) * s, H - ih * s);
  const z = document.createElement('div'); z.id = 'pvZoom'; z.className = 'pvZoom';
  z.innerHTML = `<div class="pvZin" style="width:${iw}px;height:${ih}px"><img src="${$('#pvImg').src}" alt=""><svg viewBox="0 0 100 100" preserveAspectRatio="none"><path class="pvShade show" fill-rule="evenodd" d="M0 0H100V100H0Z${rects(id).map(([x, y, w, h]) => `M${x} ${y}h${w}v${h}h${-w}Z`).join('')}"/>${rects(id).map(([x, y, w, h]) => `<rect class="pvBox on" x="${x}" y="${y}" width="${w}" height="${h}" rx=".6" style="--c:${shelf(id).c}"/>`).join('')}</svg></div>`;
  pv.append(z);
  const zin = z.firstElementChild, from = `translate(${-sc.scrollLeft}px,${-sc.scrollTop}px) scale(1)`, to = `translate(${tx}px,${ty}px) scale(${s})`;
  zin.style.transform = to; z.dataset.from = from;
  if (calm()) return Promise.resolve(z);
  return zin.animate([{ transform: from }, { transform: to }], { duration: 820, easing: 'cubic-bezier(.65,0,.25,1)' }).finished.then(() => z, () => z);
}
function zoomOut() {
  const z = $('#pvZoom'); if (!z) return Promise.resolve();
  const zin = z.firstElementChild;
  if (calm()) { z.remove(); return Promise.resolve(); }
  return zin.animate([{ transform: zin.style.transform }, { transform: z.dataset.from }], { duration: 620, easing: 'cubic-bezier(.65,0,.25,1)' }).finished.then(() => z.remove(), () => z.remove());
}

async function go(id, focusPid = null) {
  if (busy || edit) return;
  if (mode === '3d') return go3d(id, focusPid);
  busy = true;
  try {
    if (shot) await closeShot(false);
    sel = id; boxes(); chips(); side();
    const s = shelf(id);
    if (!s) { $('#shelfPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    let key = s.photos ? s.id + '1' : null;
    if (focusPid && s.photos) for (let k = 1; k <= s.photos; k++) if ((SPOTS[s.id + k] || []).some(x => x.id === focusPid)) { key = s.id + k; break; }
    const preload = key ? blobUrl(`/api/galpao/${key}.jpg`).catch(() => null) : null;
    await new Promise(r => setTimeout(r, calm() ? 0 : 180));      // deixa ver o destaque antes de entrar
    await zoomIn(id);
    openShot(s, key, await preload, focusPid);
  } finally { busy = false; }
}

/* ── foto de perto com as peças ── */
function openShot(s, key, url, focusPid) {
  const el = $('#pvShot'), k = key ? +key.slice(1) : 0, spots = key ? SPOTS[key] || [] : [];
  shot = { s, k, key };
  el.innerHTML = `<header class="pvHead"><button class="btn sm pvBack" data-close-shot>${icon('back')}Galpão</button><span class="shBadge sm" style="--c:${s.c}">${s.id}</span>
      <div class="tx"><b>${esc(s.name)}</b><small>${key ? `Foto ${k} de ${s.photos} · ${spots.length ? `${spots.length} peças marcadas` : 'sem peças marcadas'}` : `${items(s.id).length} peças · vista da foto geral`}</small></div></header>
    ${key ? `<div class="pvFrameWrap"><div class="vsFrame" id="vsFrame"><img id="vsImg" alt="Foto da estante ${s.id}"><div id="vsSpots" class="vsSpots"></div></div>
      ${s.photos > 1 ? `<button class="vsNav prev" data-step="-1" aria-label="Foto anterior">${icon('back')}</button><button class="vsNav next" data-step="1" aria-label="Próxima foto">${icon('send')}</button>` : ''}
      <div id="vsPop" class="vsPop" hidden><b id="vsPopName"></b><span>Ainda não está no estoque.</span><div class="row"><button type="button" id="vsReg" class="btn sm primary">${icon('plus')}Cadastrar com este recorte</button><button type="button" id="vsPopX" class="btn sm ghost">Agora não</button></div></div></div>
      <footer class="pvFoot"><p class="vsLegend"><span class="lg has"></span>No estoque: toque para abrir<span class="lg new"></span>Sem cadastro: toque para cadastrar</p>
      ${s.photos > 1 ? `<div class="vsThumbs">${Array.from({ length: s.photos }, (_, j) => `<button data-k="${s.id}${j + 1}" aria-current="${j + 1 === k}"><img alt="Foto ${j + 1}" data-src="/api/galpao/t${s.id}${j + 1}.jpg"></button>`).join('')}</div>` : ''}</footer>` : ''}`;
  el.hidden = false; el.classList.toggle('bare', !key); $('#pv').classList.add('shotting');
  $('#pv').style.setProperty('--sh', ($('#pvScroll') || $('#pv')).clientHeight + 'px');
  requestAnimationFrame(() => el.classList.add('in'));
  if (!key) return;
  $('#vsSpots').innerHTML = spots.map((x, i) => { const p = x.id && byId(x.id); return `<button class="spot ${p ? 'has' : 'new'}${focusPid && x.id === focusPid ? ' pick' : ''}" data-i="${i}" style="left:${x.x}%;top:${x.y}%;width:${x.w}%;height:${x.h}%;--d:${i * 70}ms" aria-label="${esc(p ? p.name : x.name)}${p ? '' : ' (sem cadastro)'}"><span>${icon(p ? 'box' : 'plus')}${esc(p ? p.name : x.name)}${p ? `<em>${qty(p)}</em>` : ''}</span></button>`; }).join('');
  const img = $('#vsImg'), done = () => $('#vsFrame')?.classList.add('ok');
  const set = u => { if (shot?.key !== key || !u) return; img.src = u; (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).finally(done); };
  url ? set(url) : blobUrl(`/api/galpao/${key}.jpg`).then(set).catch(e => toast(e.message, true));
  $$('.vsThumbs img', el).forEach(im => blobUrl(im.dataset.src).then(u => im.src = u).catch(() => {}));
}
async function closeShot(clearSel = true) {
  const el = $('#pvShot');
  el.classList.remove('in'); shot = null;
  await new Promise(r => setTimeout(r, calm() ? 0 : 260));
  el.hidden = true; el.innerHTML = ''; $('#pv').classList.remove('shotting');
  await zoomOut();
  if (clearSel) { sel = null; boxes(); chips(); side(); }
}

/* ── 3D ── */
const shelfPhotoKey = (s, pid) => { if (!s.photos) return null; if (pid) for (let k = 1; k <= s.photos; k++) if ((SPOTS[s.id + k] || []).some(x => x.id === pid)) return s.id + k; return s.id + '1'; };
async function mount3d() {
  const host = $('#g3'); if (!host) return;
  try {
    G3 = await import('./galpao3d.js');
    if (!$('#g3') || mode !== '3d') return;
    G3.mount(host, {
      onPick: id => { if (busy) return; if (id) go(id); else if (sel !== null || card) reset3d(); },
      onHover: id => $$('#g3Tags .pvTag').forEach(b => b.classList.toggle('hov', b.dataset.shelf === id)),
      tagBox: () => $('#g3Tags'),
    });
    $('#g3Load')?.remove(); $('#pv').classList.add('ok');
    paint3d();
  } catch (e) {
    console.error(e);
    $('#g3Load').innerHTML = `Este aparelho não conseguiu abrir o 3D. <button class="btn sm" data-mode="foto">Ver a foto real</button>`;
  }
}
function paint3d() {
  const h = hits(), low = lowBy();
  const tg = $('#g3Tags');
  if (tg) tg.innerHTML = SHELVES.map(s => {
    const c = items(s.id).length, l = low[s.id] || 0, red = g3mode === 'divergencia' && l;
    return `<button class="pvTag g3Tag${sel === s.id ? ' on' : ''}${h ? (h.has(s.id) ? ' hit' : ' dim') : ''}${red ? ' red' : ''}" data-shelf="${s.id}" style="--c:${red ? '#ff3b55' : s.c}" aria-label="Estante ${s.id}: ${esc(s.name)}, ${c} peças"><b>${s.id}</b><span>${esc(s.name)}</span><small>${red ? `${l} em falta` : c}</small></button>`;
  }).join('');
  const k = $('#g3Kpi');
  if (k) {
    const placed = state.products.filter(p => p.location), loose = state.products.filter(p => !p.location).length, lows = Object.values(low).reduce((a, v) => a + v, 0);
    k.innerHTML = `<div><small>Peças nas estantes</small><b>${n(placed.length)}</b></div><div><small>Unidades</small><b>${n(units(placed))}</b></div>
      <div class="${lows ? 'bad' : ''}"><small>Abaixo do mínimo</small><b>${n(lows)}</b></div><div><small>Sem estante</small><b>${n(loose)}</b></div>`;
  }
  G3?.update({ sel, hits: h, low, mode: g3mode });
  cardRender();
}
async function go3d(id, pid = null) {
  busy = true;
  try {
    sel = id; G3?.clearRoute();
    card = pid ? { kind: 'prod', id, pid } : id ? { kind: 'shelf', id } : null;
    const s = shelf(id);
    boxes(); chips(); side(); bar();
    if (!s) { $('#shelfPanel').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    await G3?.focus(id, !!pid);
    if (pid && sel === id) { const r = G3?.route(id); if (r && card?.pid === pid) { card.meters = r.meters; cardRender(); } }
  } finally { busy = false; }
}
function reset3d() {
  sel = null; card = null; G3?.clearRoute(); G3?.overview();
  boxes(); chips(); side(); bar();
}
function cardRender() {
  const el = $('#g3Card'); if (!el) return;
  if (g3mode === 'divergencia' && !card) {
    const list = state.products.filter(p => p.location && isLow(p)).sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name, 'pt-BR'));
    el.hidden = false; el.className = 'g3Card div';
    el.innerHTML = `<header><span class="g3Live red"><i></i>Divergência de estoque</span><button class="g3X" data-g3x aria-label="Fechar">${icon('x')}</button></header>
      <p class="g3Lead">${list.length ? `<b>${list.length}</b> ${list.length === 1 ? 'peça está' : 'peças estão'} no mínimo ou abaixo dele. Toque para ver onde está.` : 'Nenhuma peça abaixo do mínimo. Tudo certo!'}</p>
      <ul class="g3List">${list.slice(0, 40).map(p => `<li><button data-pid="${p.id}" data-go="${p.location}"><span class="shBadge sm" style="--c:#ff3b55">${p.location}</span><span class="tx"><b>${esc(p.name)}</b><small>Sistema ${n(p.quantity)} ${unitOf(p)} · mínimo ${n(p.min_quantity)}</small></span></button></li>`).join('')}</ul>`;
    return;
  }
  if (!card) { el.hidden = true; el.innerHTML = ''; return; }
  const s = shelf(card.id); if (!s) { el.hidden = true; return; }
  el.hidden = false;
  const list = items(s.id), low = list.filter(isLow), key = shelfPhotoKey(s, card.pid);
  const fotos = key ? `<button class="btn sm" data-g3photo="${key}">${icon('photo')}Fotos da estante</button>` : '';
  if (card.kind === 'prod') {
    const p = byId(card.pid); if (!p) { card = { kind: 'shelf', id: s.id }; return cardRender(); }
    const bad = isLow(p), spotted = key && (SPOTS[key] || []).some(x => x.id === p.id);
    el.className = 'g3Card prod' + (bad ? ' warn' : '');
    el.innerHTML = `<header><span class="g3Live${bad ? ' red' : ''}"><i></i>${bad ? 'Estoque insuficiente' : 'Produto localizado'}</span><button class="g3X" data-g3x aria-label="Fechar">${icon('x')}</button></header>
      <small class="g3Cap">Posição</small><div class="g3Pos"><span class="shBadge" style="--c:${s.c}">${s.id}</span><b>Estante ${s.id}</b></div>
      <div class="g3Prod">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : `<span class="ph">${icon('box')}</span>`}<div><b>${esc(p.name)}</b><small>#${p.id} · ${esc(p.category || 'Sem categoria')}</small></div></div>
      <dl><div class="opt"><dt>Estante</dt><dd>${esc(s.name)}</dd></div><div><dt>Saldo no sistema</dt><dd class="${bad ? 'bad' : ''}">${qty(p)} ${unitOf(p)}</dd></div>
      <div><dt>Mínimo</dt><dd>${p.min_quantity > 0 ? n(p.min_quantity) : '—'}</dd></div><div class="opt"><dt>Última mudança</dt><dd>${esc(fmtDate(p.updated_at) || '—')}</dd></div></dl>
      ${card.meters ? `<p class="g3Route">${icon('arrow')}Rota da porta até a estante: <b>≈ ${card.meters.toFixed(1).replace('.', ',')} m</b> · ${Math.max(3, Math.round(card.meters / 1.1))} s a pé</p>` : ''}
      <div class="row"><button class="btn sm primary" data-g3open="${p.id}">${icon('box')}Abrir ficha</button>${spotted ? `<button class="btn sm" data-g3photo="${key}" data-g3pid="${p.id}">${icon('cam')}Ver na foto</button>` : fotos}</div>`;
    return;
  }
  el.className = 'g3Card shelf';
  el.innerHTML = `<header><span class="g3Live" style="--lc:${s.c}"><i></i>Estante ${s.id}</span><button class="g3X" data-g3x aria-label="Fechar">${icon('x')}</button></header>
    <div class="g3Pos"><span class="shBadge" style="--c:${s.c}">${s.id}</span><b>${esc(s.name)}</b></div>
    <dl><div><dt>Tipos de peça</dt><dd>${n(list.length)}</dd></div><div><dt>Unidades</dt><dd>${n(units(list))}</dd></div><div><dt>Abaixo do mínimo</dt><dd class="${low.length ? 'bad' : ''}">${n(low.length)}</dd></div></dl>
    <div class="row"><button class="btn sm primary" data-g3route="${s.id}">${icon('arrow')}Rota até aqui</button>${fotos}</div>`;
}
function setMode(m) {
  if (m === mode) return;
  mode = m; try { localStorage.setItem('hm-galpao', m); } catch {}
  if (shot) { shot = null; }
  G3?.unmount(); sel = null; card = null;
  $('#plan').innerHTML = ''; modeBtns(); render();
}
function modeBtns() { $$('#gMode [data-mode]').forEach(b => b.setAttribute('aria-pressed', b.dataset.mode === mode)); const h = $('#gHint'); if (h) h.textContent = mode === '3d' ? 'O estoque em 3D, montado a partir das fotos. Busque uma peça para ver onde ela está e o caminho até ela.' : 'A foto do galpão de verdade. Toque numa estante para entrar nela e depois toque na peça.'; }
function step(d) { const s = shot.s, k = (shot.k - 1 + d + s.photos) % s.photos + 1; openShot(s, s.id + k, null); }

async function crop(x) {
  const img = $('#vsImg'), W = img.naturalWidth, H = img.naturalHeight, c = document.createElement('canvas');
  const sx = W * x.x / 100, sy = H * x.y / 100, sw = Math.max(8, W * x.w / 100), sh = Math.max(8, H * x.h / 100);
  c.width = Math.round(sw); c.height = Math.round(sh); c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', .88));
  return new File([b], 'recorte.jpg', { type: 'image/jpeg' });
}
function spotClick(btn) {
  const x = (SPOTS[shot.key] || [])[+btn.dataset.i]; if (!x) return;
  const p = x.id && byId(x.id);
  if (p) {     // destaca a peça na foto e abre a ficha dela
    $$('#vsSpots .spot').forEach(b => b.classList.toggle('pick', b === btn)); $('#vsFrame').classList.add('picking');
    setTimeout(() => { $('#vsFrame')?.classList.remove('picking'); openDetail(p.id); }, calm() ? 0 : 520);
    return;
  }
  const pop = $('#vsPop'); pop.hidden = false; pop.dataset.i = btn.dataset.i;
  $('#vsPopName').textContent = x.name;
  const f = $('#vsFrame'), w = f.parentElement.getBoundingClientRect(), r = btn.getBoundingClientRect();
  pop.style.left = Math.max(8, Math.min(w.width - 330, r.left - w.left)) + 'px'; pop.style.top = Math.max(8, Math.min(w.height - 130, r.bottom - w.top + 6)) + 'px';
}
async function registerSpot(x, fromPhoto) {
  let file = null;
  try { if (fromPhoto) file = await crop(x); } catch {}
  newWithCrop(file, { name: x.name, location: shot?.s.id || sel || '' });
}

/* ── lista da estante (abaixo da foto) ── */
function row(p) {
  return `<li class="shItem"><button class="shOpen" data-pid="${p.id}"><span class="th">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy">` : icon('box')}</span>
    <span class="tx"><b>${esc(p.name)}</b><small>${esc(p.category || 'Sem categoria')} · #${p.id}</small></span><em>${qty(p)}</em></button>
    <label class="mv" title="Mudar de estante"><span class="sr">Estante de ${esc(p.name)}</span>${icon('pin')}<select data-loc="${p.id}">${shelfOptions(p.location || '')}</select></label></li>`;
}
function side() {
  const el = $('#shelfPanel'); if (!el) return;
  if (sel === null) { el.hidden = true; el.innerHTML = ''; return; }
  el.hidden = false;
  const s = shelf(sel), list = items(sel), spots = s ? Array.from({ length: s.photos }, (_, k) => SPOTS[s.id + (k + 1)] || []).flat() : [];
  const missing = [...new Map(spots.filter(x => !x.id || !byId(x.id)).map(x => [x.name, x])).values()];
  el.innerHTML = `<div class="shHead"><span class="shBadge" style="--c:${s ? s.c : 'var(--ink-3)'}">${s ? s.id : '?'}</span><div><h2>${s ? esc(s.name) : 'Peças sem estante'}</h2>
      <p class="muted">${list.length} ${list.length === 1 ? 'tipo' : 'tipos'} de peça${units(list) ? ` · ${n(units(list))} unidades` : ''}</p></div></div>
    <ul class="shList">${list.map(row).join('') || '<li class="muted empty1">Nenhuma peça marcada nesta estante ainda.</li>'}</ul>
    ${missing.length ? `<div class="miss"><p><b>Vistas na foto, sem cadastro</b><small>Toque para cadastrar.</small></p>${missing.map(x => `<button class="chipNew" data-new="${esc(x.name)}">${icon('plus')}${esc(x.name)}</button>`).join('')}</div>` : ''}`;
}
function finder() {
  const box = $('#gFound');
  if (!q) { box.innerHTML = ''; box.hidden = true; return; }
  const found = state.products.filter(p => p._s.includes(q)).slice(0, 6);
  box.hidden = false;
  box.innerHTML = found.map(p => { const s = shelf(p.location); return `<button data-pid="${p.id}" data-go="${p.location || ''}"><span class="shBadge sm" style="--c:${s ? s.c : 'var(--ink-3)'}">${s ? s.id : '?'}</span><span class="tx"><b>${esc(p.name)}</b><small>${s ? 'Estante ' + s.id + ' · ' + esc(s.name) : 'Ainda sem estante'}</small></span></button>`; }).join('')
    || `<p class="muted">Nada encontrado.</p>`;
}

/* ── ajustar marcações (só administrador) ── */
function startEdit() {
  if (shot) closeShot();
  edit = { id: sel && shelf(sel) ? sel : 'A', rects: JSON.parse(JSON.stringify(layout)) };
  $('#pv').classList.add('editing'); bar(); boxes();
}
function stopEdit() { edit = null; $('#pv').classList.remove('editing'); bar(); boxes(); chips(); }
async function saveEdit() {
  try {
    const d = await api('/api/galpao/layout', { json: { shelves: edit.rects } });
    layout = d.layout.shelves; toast('Marcações salvas'); stopEdit();
  } catch (e) { toast(e.message, true); }
}

export function render() {
  if ($('#v-galpao').hidden) return;
  modeBtns();
  if (!$('#pv') && mode === '3d') { $('#plan').innerHTML = stage(); bar(); mount3d(); }
  else if (mode === '3d') { G3?.wake(); bar(); }
  if (!$('#pv')) {
    $('#plan').innerHTML = stage(); pointer(); bar();
    const img = $('#pvImg');
    blobUrl('/api/galpao/pano.jpg').then(u => { img.src = u; img.decode?.().catch(() => {}).finally(() => { $('#pv').classList.add('ok'); }); }).catch(e => toast(e.message, true));
    requestAnimationFrame(() => { sizePano(); centerOn(innerWidth < 640 ? 30 : 50, 50); });
    api('/api/galpao/layout').then(d => { if (d.layout?.shelves) { layout = d.layout.shelves; boxes(); chips(); } }).catch(() => {});
  }
  boxes(); chips(); side(); finder();
}

export async function setLocation(pid, loc) {
  try {
    await api(`/api/products/${pid}/location`, { json: { location: loc } });
    patch(pid, { location: loc }); toast(loc ? `Guardada na estante ${loc}` : 'Peça sem estante');
  } catch (e) { toast(e.message, true); render(); }
}

export function init() {
  if (inited) return; inited = true;
  subscribe(() => { if (!$('#v-galpao').hidden && $('#pv')) { boxes(); chips(); side(); finder(); } });
  const v = $('#v-galpao');
  v.addEventListener('click', e => {
    if (e.target.closest('#pvScroll') && $('#pvScroll').dataset.drag) return;
    const md = e.target.closest('[data-mode]'); if (md) return setMode(md.dataset.mode);
    if (mode === '3d') {
      const gm = e.target.closest('[data-g3]');
      if (gm) { const m = gm.dataset.g3; if (m === 'geral') { g3mode = 'geral'; reset3d(); } else { g3mode = g3mode === 'divergencia' ? 'geral' : 'divergencia'; card = null; sel = null; G3?.clearRoute(); G3?.overview(); boxes(); chips(); side(); bar(); } return; }
      if (e.target.closest('[data-g3x]')) { if (g3mode === 'divergencia' && !card) { g3mode = 'geral'; bar(); } return reset3d(); }
      const rt = e.target.closest('[data-g3route]'); if (rt) { const r = G3?.route(rt.dataset.g3route); if (r) toast(`Rota: ≈ ${r.meters.toFixed(1).replace('.', ',')} m da porta até a estante ${rt.dataset.g3route}`); return; }
      const op3 = e.target.closest('[data-g3open]'); if (op3) return openDetail(+op3.dataset.g3open);
      const ph = e.target.closest('[data-g3photo]');
      if (ph) { const s = shelf(sel); const pid = +ph.dataset.g3pid || null; if (s) blobUrl(`/api/galpao/${ph.dataset.g3photo}.jpg`).catch(() => null).then(u => openShot(s, ph.dataset.g3photo, u, pid)); return; }
      const gl = e.target.closest('.g3List [data-pid]'); if (gl) return go(gl.dataset.go, +gl.dataset.pid);
      if (e.target.closest('[data-close-shot]')) return closeShot(false);
      const t3 = e.target.closest('[data-shelf]');
      if (t3 && !e.target.closest('#gFound') && !e.target.closest('.shOpen')) { if (sel === t3.dataset.shelf && shelf(sel)?.photos && !shot) { const s = shelf(sel), k = s.id + '1'; blobUrl(`/api/galpao/${k}.jpg`).catch(() => null).then(u => openShot(s, k, u, null)); return; } return go(t3.dataset.shelf); }
    }
    if (e.target.closest('[data-edit]')) return startEdit();
    const ed = e.target.closest('[data-ed]'); if (ed) { edit.id = ed.dataset.ed; bar(); boxes(); return; }
    if (e.target.closest('[data-edclear]')) { delete edit.rects[edit.id]; bar(); boxes(); return; }
    if (e.target.closest('[data-edcancel]')) return stopEdit();
    if (e.target.closest('[data-edsave]')) return saveEdit();
    if (edit) return;
    const z = e.target.closest('[data-z]'); if (z) return setZoom(z.dataset.z === 'in' ? 1.35 : .74);
    if (e.target.closest('[data-close-shot]')) return closeShot();
    const st = e.target.closest('[data-step]'); if (st) return step(+st.dataset.step);
    const th = e.target.closest('[data-k]'); if (th) return openShot(shot.s, th.dataset.k, null);
    const sp = e.target.closest('.spot'); if (sp) return spotClick(sp);
    if (e.target.closest('#vsReg')) return registerSpot((SPOTS[shot.key] || [])[+$('#vsPop').dataset.i], true);
    if (e.target.closest('#vsPopX')) { $('#vsPop').hidden = true; return; }
    const nw = e.target.closest('[data-new]'); if (nw) return registerSpot({ name: nw.dataset.new }, false);
    const found = e.target.closest('#gFound [data-pid]');
    if (found) { q = ''; $('#gQ').value = ''; finder(); const pid = +found.dataset.pid; go(found.dataset.go, pid).then(() => requestAnimationFrame(() => $(`.shOpen[data-pid="${pid}"]`)?.classList.add('flash'))); return; }
    const op = e.target.closest('.shOpen'); if (op) return openDetail(+op.dataset.pid);
    const sh = e.target.closest('[data-shelf]'); if (sh) return sel === sh.dataset.shelf && shot ? closeShot() : go(sh.dataset.shelf);
  });
  v.addEventListener('keydown', e => {
    if (!shot) return;
    if (e.key === 'Escape') { e.preventDefault(); closeShot(); }
    if (shot?.s.photos > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) step(e.key === 'ArrowRight' ? 1 : -1);
  });
  v.addEventListener('change', e => { const s = e.target.closest('select[data-loc]'); if (s) setLocation(+s.dataset.loc, s.value); });
  $('#gQ').addEventListener('input', e => { q = fold(e.target.value.trim()); boxes(); finder(); });
  addEventListener('resize', () => { if ($('#pv') && !$('#v-galpao').hidden && mode !== '3d') { sizePano(); if (shot) { $('#pvZoom')?.remove(); } } });
}
export function load() { init(); render(); }
