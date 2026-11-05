/* Painel: resumo do estoque em cartões de vidro.
   Números com mini gráfico, movimentações da semana, o que aconteceu hoje, com quem está, reposição. */
import { $, esc, n, icon, api, countUp, personColor, initials } from './core.js';
import { state, subscribe, activeHolders } from './state.js';
import { openDetail } from './estoque.js';
import * as pessoas from './pessoas.js';

let hist = [], histAt = 0, lastStats = {}, lastSig = '';
const DAY = 864e5;
const isPending = p => p.review_status === 'pendente';
const isLow = p => !isPending(p) && p.min_quantity > 0 && p.quantity <= p.min_quantity;
const KIND = { saida: ['Saída', 'var(--red-l)'], entrada: ['Entrada', 'var(--capri)'], consumo: ['Baixa', 'var(--orange)'], ajuste: ['Ajuste', 'var(--rosa)'], cadastro: ['Nova peça', 'var(--blue-l)'] };
const hm = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
const place = m => (m.destination || '').replace(/^Outros:\s*/, '');
const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const today0 = () => dayStart(Date.now());
/* índice do dia (0 = hoje, 1 = ontem…) */
const ago = m => Math.round((today0() - dayStart(m.created_at)) / DAY);
function perDay(days, fn) { const a = Array(days).fill(0); for (const m of hist) { const k = ago(m); if (k >= 0 && k < days) a[days - 1 - k] += fn(m); } return a; }

function spark(vals) {
  const W = 96, H = 30, max = Math.max(...vals), min = Math.min(...vals), r = max - min || 1;
  const pts = vals.map((v, i) => [i * W / (vals.length - 1), H - 3 - (v - min) / r * (H - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><path class="a" d="${d} L${W} ${H} L0 ${H} Z"/><path class="l" d="${d}"/></svg>`;
}
const chip = (v, word) => v > 0 ? `<em class="chip up">+${n(v)} ${word}</em>` : v < 0 ? `<em class="chip down">−${n(-v)} ${word}</em>` : `<em class="chip">0 ${word}</em>`;

function stats() {
  const P = state.products, ok = P.filter(p => !isPending(p)), pend = P.length - ok.length;
  const unidades = ok.filter(p => p.unit === 'un').reduce((a, p) => a + p.quantity, 0);
  const comPessoas = P.reduce((a, p) => a + (p._out || 0), 0);
  const moves = perDay(14, m => m.kind === 'cadastro' ? 0 : 1);
  const net = perDay(14, m => m.kind === 'entrada' || m.kind === 'saida' ? m.amount : m.kind === 'ajuste' ? m.amount : 0);
  const trend = []; let u = unidades; for (let i = 13; i >= 0; i--) { trend[i] = u; u -= net[i]; }
  const toPeople = perDay(14, m => m.holder_id && m.kind === 'saida' ? Math.abs(m.amount) : 0);
  const s = { pecas: ok.length, unidades, pessoas: comPessoas, hoje: moves[13] };
  const tiles = [
    ['pecas', 'Peças no estoque', 'var(--red)', 'box', pend ? `<em class="chip warn">${n(pend)} a conferir</em>` : '<em class="chip up">tudo conferido</em>', perDay(14, m => m.kind === 'cadastro' ? 1 : 0)],
    ['unidades', 'Unidades guardadas', 'var(--blue)', 'grid', chip(net[13], 'hoje'), trend],
    ['pessoas', 'Com pessoas', 'var(--pink)', 'users', `<em class="chip">${n(activeHolders().length)} pessoas</em>`, toPeople],
    ['hoje', 'Movimentações hoje', 'var(--orange)', 'pulse', chip(moves[13] - moves[12], 'que ontem'), moves],
  ];
  $('#dashStats').innerHTML = tiles.map(([k, l, c, ic, ch, sp], i) => `<div class="stat" style="--c:${c};--i:${i}"><i>${icon(ic)}</i><span class="go">${icon('arrow')}</span><span>${l}</span><b data-count="${s[k]}" data-from="${lastStats[k] ?? 0}">${n(lastStats[k] ?? 0)}</b><div class="sbot">${ch}${spark(sp)}</div></div>`).join('');
  lastStats = s; countUp($('#dashStats'));
}

function week() {
  const DN = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const cnt = perDay(14, m => m.kind === 'cadastro' ? 0 : 1), cur = cnt.slice(7), prev = cnt.slice(0, 7).reduce((a, b) => a + b, 0), tot = cur.reduce((a, b) => a + b, 0);
  const max = Math.max(4, ...cur), top = Math.ceil(max / 4) * 4;
  const info = (k) => { const by = {}; for (const m of hist) if (ago(m) === 6 - k && m.kind !== 'cadastro') by[m.kind] = (by[m.kind] || 0) + 1; return Object.entries(by).map(([kk, v]) => `${v} ${KIND[kk]?.[0].toLowerCase() || kk}`).join(', ') || 'nada'; };
  $('#weekChart').innerHTML = `<div class="yax">${[0, 1, 2, 3, 4].map(i => `<span>${n(top / 4 * i)}</span>`).join('')}</div><div class="plot">${cur.map((v, k) => {
    const d = new Date(today0() - (6 - k) * DAY), isT = k === 6;
    return `<div class="col${isT ? ' today' : ''}" style="--k:${k};--h:${(v / top * 100).toFixed(1)}%" title="${esc(info(k))}"><div class="bw"><b>${n(v)}</b><div class="bar2"></div></div><span>${isT ? 'Hoje' : DN[d.getDay()]}</span></div>`;
  }).join('')}</div>`;
  const pct = prev ? Math.round((tot - prev) / prev * 100) : null;
  $('#weekDelta').className = 'chip ' + (pct === null ? '' : pct >= 0 ? 'up' : 'down');
  $('#weekDelta').textContent = pct === null ? `${n(tot)} na semana` : `${pct >= 0 ? '+' : '−'}${Math.abs(pct)}% vs semana anterior`;
}

function todayList() {
  const names = new Map(state.holders.map(h => [h.id, h.name]));
  let rows = hist.filter(m => ago(m) === 0), title = 'Hoje';
  if (!rows.length) { rows = hist.slice(0, 8); title = 'Últimas'; }
  $('#todayTitle').textContent = title;
  $('#todayDate').textContent = title === 'Hoje' ? new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : 'Nada registrado hoje ainda';
  $('#todayList').innerHTML = rows.length ? rows.slice(0, 30).map((m, k) => {
    const [lbl, c] = KIND[m.kind] || [m.kind, 'var(--ink-3)'], who = m.holder_id ? names.get(m.holder_id) : '';
    const where = m.kind === 'consumo' ? `${lbl} de ${who || 'pessoa'}${place(m) ? ` · ${place(m)}` : ''}` : who ? `${lbl} ${m.kind === 'saida' ? 'para' : 'de'} ${who}` : place(m) ? `${lbl} ${m.kind === 'entrada' ? 'de' : 'para'} ${place(m)}` : lbl;
    const amt = m.amount > 0 ? '+' + n(m.amount) : '−' + n(-m.amount);
    return `<li style="--k:${Math.min(k, 10)}"><time>${esc(title === 'Hoje' ? hm(m.created_at) : new Date(m.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }))}</time><div class="ev" data-pid="${m.product_id}" style="--c:${c}">${who ? `<span class="av" style="background:${personColor(m.holder_id)}">${esc(initials(who))}</span>` : ''}<div><b>${esc(m.product_name)}</b><small>${esc(where)}</small></div><em>${amt}</em></div></li>`;
  }).join('') : '<li><span class="none">Nenhuma movimentação ainda. As saídas e entradas aparecem aqui.</span></li>';
}

function boards() {
  const hs = activeHolders().map(h => ({ h, u: h.items.reduce((a, i) => a + i.quantity, 0) })).sort((a, b) => b.u - a.u), hmax = hs[0]?.u || 1;
  $('#holdCount').textContent = hs.length ? `${hs.length} pessoas` : '';
  $('#holdList').innerHTML = hs.length ? hs.slice(0, 6).map(({ h, u }, k) => `<li data-holder="${h.id}"><div class="top4"><span class="nm"><i style="--c:${personColor(h.id)}">${esc(initials(h.name))}</i>${esc(h.name)}</span><span class="vl">${n(u)} un · ${h.items.length} peças</span></div><div class="tr"><i style="--w:${Math.max(3, Math.round(u / hmax * 100))}%;--c:${personColor(h.id)};--k:${k}"></i></div></li>`).join('')
    : `<li data-go="pessoas"><span class="muted">Ninguém com peças. Toque para cadastrar pessoas.</span></li>`;
  const lowAll = state.products.filter(isLow), low = [...lowAll].sort((a, b) => a.quantity / a.min_quantity - b.quantity / b.min_quantity).slice(0, 6);
  $('#lowCount').textContent = lowAll.length ? `${lowAll.length} peças` : 'tudo em dia';
  $('#lowList').innerHTML = low.length ? low.map((p, k) => `<li data-pid="${p.id}"><div class="top4"><span class="nm">${esc(p.name)}</span><span class="vl">${n(p.quantity)} / mín. ${n(p.min_quantity)}</span></div><div class="tr"><i style="--w:${Math.max(4, Math.round(p.quantity / p.min_quantity * 100))}%;--c:${p.quantity === 0 ? 'var(--red-l)' : 'var(--orange)'};--k:${k}"></i></div></li>`).join('')
    : `<li style="cursor:default"><span class="muted">Nenhuma peça abaixo do mínimo.</span></li>`;
  const count = new Map();
  for (const m of hist) if (m.kind !== 'cadastro') count.set(m.product_id, (count.get(m.product_id) || 0) + Math.abs(m.amount));
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, 6), max = top[0]?.[1] || 1;
  const COL = ['var(--blue)', 'var(--red-l)', 'var(--orange)', 'var(--pink)', 'var(--capri)', 'var(--rosa)'];
  $('#topList').innerHTML = top.length ? top.map(([pid, q], k) => { const p = state.products.find(x => x.id === pid); return `<li data-pid="${pid}"><div class="top4"><span class="nm">${esc(p?.name || hist.find(m => m.product_id === pid)?.product_name || 'Peça')}</span><span class="vl">${n(q)} un</span></div><div class="tr"><i style="--w:${Math.round(q / max * 100)}%;--c:${COL[k]};--k:${k}"></i></div></li>`; }).join('')
    : `<li style="cursor:default"><span class="muted">Sem movimentações ainda.</span></li>`;
}

function hello() {
  const h = new Date().getHours(), name = (state.me?.name || '').split(' ')[0];
  $('#hello').textContent = `${h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'}${name ? ', ' + name : ''}`;
}

export function render() {
  if ($('#v-painel').hidden) return;
  hello();
  const sig = JSON.stringify([state.holders.map(h => [h.id, h.name, h.items.map(i => i.quantity)]), hist[0]?.id, hist.length, state.products.length, state.products.reduce((a, p) => a + p.quantity, 0)]);
  if (sig === lastSig) return;
  lastSig = sig; stats(); week(); todayList(); boards();
}
export async function load() {
  render();
  if (Date.now() - histAt > 15000) {
    try { hist = await api('/api/history?limit=300'); histAt = Date.now(); render(); } catch {}
  }
}
export function init() {
  let t; subscribe(() => { clearTimeout(t); t = setTimeout(render, 60); });
  document.addEventListener('stock:changed', () => { histAt = 0; });
  $('#v-painel').addEventListener('click', e => {
    const go = e.target.closest('[data-go]'); if (go) { location.hash = go.dataset.go; return; }
    const h = e.target.closest('[data-holder]'); if (h) { pessoas.select(h.dataset.holder); location.hash = 'pessoas'; return; }
    const li = e.target.closest('[data-pid]'); if (li) openDetail(+li.dataset.pid);
  });
}
