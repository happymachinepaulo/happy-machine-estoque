/* Painel ao vivo: mapa neon de onde está cada peça (estoque central → pessoas → lugares),
   letreiro de LED com as últimas movimentações e quadros de reposição. */
import { $, esc, n, icon, api, countUp, personColor, initials, fmtDate } from './core.js';
import { state, subscribe, activeHolders } from './state.js';
import { openDetail } from './estoque.js';
import * as pessoas from './pessoas.js';

const NS = 'http://www.w3.org/2000/svg';
let hist = [], histAt = 0, lastStats = {};
const isPending = p => p.review_status === 'pendente';
const isLow = p => !isPending(p) && p.min_quantity > 0 && p.quantity <= p.min_quantity;
const KIND = { saida: ['SAÍDA', 'var(--red-l)'], entrada: ['ENTRADA', 'var(--capri)'], consumo: ['BAIXA', 'var(--orange)'], ajuste: ['AJUSTE', 'var(--rosa)'], cadastro: ['NOVA PEÇA', 'var(--yellow)'] };
const hm = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const placeName = m => (m.destination || '').replace(/^Outros:\s*/, '') || 'Outros';

function stats() {
  const P = state.products, ok = P.filter(p => !isPending(p)), today = new Date().toDateString();
  const s = { pecas: ok.length, unidades: ok.filter(p => p.unit === 'un').reduce((a, p) => a + p.quantity, 0), pessoas: P.reduce((a, p) => a + (p._out || 0), 0), hoje: hist.filter(m => new Date(m.created_at).toDateString() === today).length };
  const tiles = [['pecas', 'peças no estoque', 'var(--red)', 'box'], ['unidades', 'unidades guardadas', 'var(--blue)', 'grid'], ['pessoas', 'com pessoas', 'var(--pink)', 'users'], ['hoje', 'movimentações hoje', 'var(--orange)', 'pulse']];
  $('#dashStats').innerHTML = tiles.map(([k, l, c, ic], i) => `<div class="stat" style="--c:${c};--i:${i}"><i>${icon(ic)}</i><span>${l}</span><b data-count="${s[k]}" data-from="${lastStats[k] ?? 0}">${n(lastStats[k] ?? 0)}</b></div>`).join('');
  lastStats = s; countUp($('#dashStats'));
}

function ticker() {
  const names = new Map(state.holders.map(h => [h.id, h.name]));
  const rows = hist.slice(0, 24);
  const item = m => {
    const [lbl, c] = KIND[m.kind] || [m.kind, 'var(--ink)'];
    const who = m.holder_id ? names.get(m.holder_id) : '';
    const where = m.kind === 'consumo' ? `${who} → ${placeName(m)}` : who ? (m.kind === 'saida' ? `→ ${who}` : `← ${who}`) : m.destination ? (m.kind === 'saida' ? `→ ${placeName(m)}` : `← ${placeName(m)}`) : '';
    return `<span class="it" style="--c:${c}"><em>${esc(hm(m.created_at))}</em><b>${lbl}</b>${n(Math.abs(m.amount))}× ${esc(m.product_name)} ${where ? `<em>${esc(where)}</em>` : ''}</span>`;
  };
  const html = rows.length ? rows.map(item).join('') : '<span class="it" style="--c:var(--yellow)"><b>HAPPY MACHINE</b>Nenhuma movimentação ainda. As saídas e entradas aparecem aqui.</span>';
  const tr = $('#ticker .track'); tr.innerHTML = html + html; tr.style.setProperty('--t', Math.max(30, rows.length * 5) + 's');
}

function boards() {
  const low = state.products.filter(isLow).sort((a, b) => a.quantity / a.min_quantity - b.quantity / b.min_quantity).slice(0, 6);
  $('#lowCount').textContent = low.length ? `${state.products.filter(isLow).length} peças` : 'tudo em dia';
  $('#lowList').innerHTML = low.length ? low.map((p, k) => `<li data-pid="${p.id}"><div class="top4"><span class="nm">${esc(p.name)}</span><span class="vl">${n(p.quantity)} / mín. ${n(p.min_quantity)}</span></div><div class="tr"><i style="--w:${Math.max(4, Math.round(p.quantity / p.min_quantity * 100))}%;--c:${p.quantity === 0 ? 'var(--red-l)' : 'var(--orange)'};--k:${k}"></i></div></li>`).join('')
    : `<li style="cursor:default"><span class="muted">Nenhuma peça abaixo do mínimo.</span></li>`;
  const count = new Map();
  for (const m of hist) if (m.kind !== 'cadastro') count.set(m.product_id, (count.get(m.product_id) || 0) + Math.abs(m.amount));
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 6), max = top[0]?.[1] || 1;
  const COL = ['var(--blue)', 'var(--red-l)', 'var(--orange)', 'var(--pink)', 'var(--capri)', 'var(--rosa)'];
  $('#topList').innerHTML = top.length ? top.map(([pid, q], k) => { const p = state.products.find(x => x.id === pid); return `<li data-pid="${pid}"><div class="top4"><span class="nm">${esc(p?.name || hist.find(m => m.product_id === pid)?.product_name || 'Peça')}</span><span class="vl">${n(q)} un</span></div><div class="tr"><i style="--w:${Math.round(q / max * 100)}%;--c:${COL[k]};--k:${k}"></i></div></li>`; }).join('')
    : `<li style="cursor:default"><span class="muted">Sem movimentações ainda.</span></li>`;
}

/* ── mapa ── */
const el = (tag, attrs = {}, parent) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent?.append(e); return e; };
function curve(a, b, bend = .18) {
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y;
  return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${(mx - dy * bend).toFixed(1)} ${(my + dx * bend).toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`;
}
function map() {
  const svg = $('#map'); svg.replaceChildren();
  const small = svg.clientWidth < 640;
  const W = small ? 600 : 1000, H = small ? 820 : 620, C = { x: W / 2, y: small ? 430 : 340 };
  const R1 = small ? { x: 200, y: 245 } : { x: 300, y: 190 }, R2 = small ? { x: 225, y: 330 } : { x: 430, y: 262 };
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const defs = el('defs', {}, svg);
  const f = el('filter', { id: 'glow', x: '-200%', y: '-200%', width: '500%', height: '500%' }, defs);
  el('feGaussianBlur', { stdDeviation: '3.2', result: 'b' }, f);
  const mg = el('feMerge', {}, f); el('feMergeNode', { in: 'b' }, mg); el('feMergeNode', { in: 'SourceGraphic' }, mg);
  const rg = el('radialGradient', { id: 'coreG' }, defs); el('stop', { offset: '0%', 'stop-color': '#ff3d5e' }, rg); el('stop', { offset: '100%', 'stop-color': '#C31634' }, rg);
  el('ellipse', { class: 'ring', cx: C.x, cy: C.y, rx: R1.x, ry: R1.y }, svg);
  el('ellipse', { class: 'ring', cx: C.x, cy: C.y, rx: R2.x, ry: R2.y }, svg);
  const gLinks = el('g', {}, svg), gSpark = el('g', {}, svg), gNodes = el('g', {}, svg);

  const people = activeHolders();
  const pos = new Map(), links = new Map();
  people.forEach((h, i) => {
    const a = -Math.PI / 2 + (i / Math.max(1, people.length)) * Math.PI * 2 + (people.length === 2 ? Math.PI / 2 : 0);
    pos.set('h' + h.id, { x: C.x + Math.cos(a) * R1.x, y: C.y + Math.sin(a) * R1.y, a });
  });
  const pc = new Map();
  for (const m of hist) if (!m.holder_id || m.kind === 'consumo') if (m.destination && ['saida', 'entrada', 'consumo'].includes(m.kind)) { const k = placeName(m); pc.set(k, (pc.get(k) || 0) + 1); }
  const places = [...pc].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  places.forEach((name, i) => {
    const a = -Math.PI / 2 + ((i + .5) / Math.max(1, places.length)) * Math.PI * 2 + .35;
    pos.set('p' + name, { x: Math.min(W - 85, Math.max(85, C.x + Math.cos(a) * R2.x)), y: Math.min(H - 30, Math.max(small ? 130 : 78, C.y + Math.sin(a) * R2.y)) });
  });

  const link = (from, to, color, cls, d) => {
    const key = from + '>' + to; if (links.has(key)) return links.get(key);
    const A = from === 'c' ? C : pos.get(from), B = pos.get(to); if (!A || !B) return null;
    const p = el('path', { id: 'L' + links.size, class: 'link ' + cls, d: curve(A, B), stroke: color, style: `--d:${d}s` }, gLinks);
    links.set(key, p); return p;
  };
  people.forEach((h, i) => link('c', 'h' + h.id, personColor(h.id), '', .2 + i * .12));
  for (const m of hist) {
    if (!m.destination || (m.holder_id && m.kind !== 'consumo')) continue;
    const to = 'p' + placeName(m); if (!pos.has(to)) continue;
    if (m.kind === 'consumo' && m.holder_id) link('h' + m.holder_id, to, 'var(--orange)', 'place', .9);
    else link('c', to, m.kind === 'entrada' ? 'var(--capri)' : 'var(--red-l)', 'place', .9);
  }
  gLinks.querySelectorAll('.link').forEach(p => p.style.setProperty('--len', Math.ceil(p.getTotalLength())));

  // faíscas: cada movimentação recente vira um ponto de luz andando na linha
  const sparks = [];
  for (const m of hist.slice(0, 40)) {
    let key, rev = false, color;
    if (m.holder_id && m.kind !== 'consumo') { key = 'c>h' + m.holder_id; rev = m.kind === 'entrada'; color = rev ? 'var(--capri)' : 'var(--red-l)'; }
    else if (m.kind === 'consumo' && m.holder_id) { key = 'h' + m.holder_id + '>p' + placeName(m); color = 'var(--orange)'; }
    else if (m.destination) { key = 'c>p' + placeName(m); rev = m.kind === 'entrada'; color = rev ? 'var(--capri)' : 'var(--red-l)'; }
    if (key && links.has(key)) sparks.push({ path: links.get(key), rev, color });
    if (sparks.length >= 26) break;
  }
  if (!sparks.length) people.forEach(h => { const p = links.get('c>h' + h.id); if (p) sparks.push({ path: p, rev: false, color: personColor(h.id) }); });
  sparks.forEach((s, i) => {
    const dur = 2.4 + (i % 4) * .35, begin = (1.4 + i * .55).toFixed(2) + 's';
    const c = el('circle', { r: 4.2, class: 'spark', fill: s.color, opacity: 0 }, gSpark);
    const am = el('animateMotion', { dur: dur + 's', begin, repeatCount: 'indefinite', ...(s.rev ? { keyPoints: '1;0', keyTimes: '0;1', calcMode: 'linear' } : {}) }, c);
    el('mpath', { href: '#' + s.path.id }, am);
    el('animate', { attributeName: 'opacity', values: '0;1;1;0', keyTimes: '0;.1;.85;1', dur: dur + 's', begin, repeatCount: 'indefinite' }, c);
  });

  // nós
  const core = el('g', { class: 'node core', style: '--d:0s', 'data-go': 'estoque' }, gNodes);
  el('title', {}, core).textContent = 'Estoque central';
  el('circle', { class: 'pulse', cx: C.x, cy: C.y, r: 64, 'stroke-width': 2 }, core);
  el('circle', { class: 'pulse', cx: C.x, cy: C.y, r: 64, 'stroke-width': 2 }, core);
  el('circle', { cx: C.x, cy: C.y, r: 64, fill: 'url(#coreG)', filter: 'url(#glow)' }, core);
  el('circle', { cx: C.x, cy: C.y, r: 50, fill: '#fff' }, core);
  el('image', { href: '/assets/bear.webp', x: C.x - 40, y: C.y - 31, width: 80, height: 61 }, core);
  const units = state.products.filter(p => !isPending(p) && p.unit === 'un').reduce((a, p) => a + p.quantity, 0);
  el('text', { x: C.x, y: C.y + 96, 'text-anchor': 'middle', class: 'mbig' }, core).textContent = n(units);
  el('text', { x: C.x, y: C.y + 116, 'text-anchor': 'middle', class: 'msub' }, core).textContent = 'no estoque central';

  people.forEach((h, i) => {
    const P = pos.get('h' + h.id), u = h.items.reduce((a, it) => a + it.quantity, 0), r = Math.min(44, 26 + Math.sqrt(u) * 2.6), col = personColor(h.id);
    const g = el('g', { class: 'node', style: `--d:${.35 + i * .12}s`, 'data-holder': h.id }, gNodes);
    el('title', {}, g).textContent = `${h.name}: ${u} unidades`;
    el('circle', { class: 'halo', cx: P.x, cy: P.y, r: r + 12, fill: col, filter: 'url(#glow)' }, g);
    el('circle', { cx: P.x, cy: P.y, r, fill: col, stroke: 'rgba(255,255,255,.85)', 'stroke-width': 2 }, g);
    el('text', { x: P.x, y: P.y + 9, 'text-anchor': 'middle', class: 'ini' }, g).textContent = initials(h.name);
    const below = P.y >= C.y - 10, ty = below ? P.y + r + 22 : P.y - r - 26;
    el('text', { x: P.x, y: ty, 'text-anchor': 'middle', class: 'lbl' }, g).textContent = h.name;
    el('text', { x: P.x, y: ty + 16, 'text-anchor': 'middle', class: 'msub' }, g).textContent = `${n(u)} un · ${h.items.length} peças`;
  });
  places.forEach((name, i) => {
    const P = pos.get('p' + name), label = name.length > 18 ? name.slice(0, 17) + '…' : name, w = Math.max(70, label.length * 7.6 + 34);
    const g = el('g', { class: 'node placeNode', style: `--d:${.8 + i * .08}s` }, gNodes);
    el('title', {}, g).textContent = name;
    el('rect', { x: P.x - w / 2, y: P.y - 15, width: w, height: 30, rx: 15 }, g);
    el('text', { x: P.x, y: P.y + 4.5, 'text-anchor': 'middle' }, g).textContent = label;
  });
  $('#mapSub').textContent = people.length ? `${people.length} pessoas · ${places.length} destinos recentes` : 'Cadastre pessoas para ver o mapa';
}

export function render() {
  if ($('#v-painel').hidden) return;
  const name = (state.me?.name || '').split(' ')[0];
  $('#painelInfo').textContent = `${name ? `Olá, ${name}. ` : ''}Onde está cada peça da Happy agora.`;
  const sig = JSON.stringify([state.holders.map(h => [h.id, h.name, h.items.map(i => i.quantity)]), hist[0]?.id, hist.length, state.products.length, $('#map').clientWidth < 640]);
  if (sig === lastSig) return;
  lastSig = sig; stats(); ticker(); boards(); map();
  if (drawn) $('#map').classList.add('calm'); drawn = true;
}
let lastSig = '', drawn = false;
export async function load() {
  render();
  if (Date.now() - histAt > 15000) {
    try { hist = await api('/api/history?limit=200'); histAt = Date.now(); render(); } catch {}
  }
}
let lastW = 0;
addEventListener('resize', () => { const w = $('#map')?.clientWidth || 0; if (!$('#v-painel').hidden && (w < 640) !== (lastW < 640)) render(); lastW = w; });
export function init() {
  let t; subscribe(() => { clearTimeout(t); t = setTimeout(render, 60); });
  document.addEventListener('stock:changed', () => { histAt = 0; });
  $('#v-painel').addEventListener('click', e => {
    const go = e.target.closest('[data-go]'); if (go) { location.hash = go.dataset.go; return; }
    const h = e.target.closest('[data-holder]'); if (h) { pessoas.select(h.dataset.holder); location.hash = 'pessoas'; return; }
    const li = e.target.closest('[data-pid]'); if (li) openDetail(+li.dataset.pid);
  });
}
