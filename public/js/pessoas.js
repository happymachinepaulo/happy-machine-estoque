/* Mini estoques por pessoa: visão geral + uma subaba por pessoa. */
import { $, esc, n, icon, api, toast, subtabs, countUp, personColor, initials } from './core.js';
import { state, subscribe, activeHolders } from './state.js';
import { reload, openDetail, historyRows } from './estoque.js';
import { openMove, editHolder } from './move.js';

let sel = 'todos', hist = { id: null, rows: [] };
const byId = id => state.products.find(p => p.id === id);
const unit = p => p?.unit === 'm' ? 'm' : p?.unit === 'lote' ? 'lote(s)' : 'un';
const totals = h => ({ pecas: h.items.length, unidades: h.items.reduce((a, i) => a + i.quantity, 0) });

function overview(list) {
  $('#pesTitle').textContent = 'Pessoas';
  $('#pesInfo').textContent = 'Quem está com peças do estoque. Toque numa pessoa para ver e movimentar.';
  $('#pesActs').innerHTML = `<button class="btn primary" data-act="new">${icon('plus')}Nova pessoa</button>`;
  $('#pesBody').innerHTML = `<div class="people">${list.map((h, i) => {
    const t = totals(h);
    const top = [...h.items].sort((a, b) => b.quantity - a.quantity).slice(0, 4).map(it => byId(it.product_id)).filter(Boolean);
    return `<button class="person" data-open="${h.id}" style="--c:${personColor(h.id)};--i:${i}">
      <div class="top2"><span class="av">${esc(initials(h.name))}</span><div><h3>${esc(h.name)}</h3><span class="muted" style="font-size:13px;font-weight:650">${t.pecas ? 'Com peças do estoque' : 'Nada com ela no momento'}</span></div></div>
      <div class="nums"><div><b data-count="${t.pecas}">0</b><span>tipos de peça</span></div><div><b data-count="${t.unidades}">0</b><span>unidades</span></div></div>
      ${top.length ? `<div class="mini">${top.map(p => `<span>${esc(p.name)}</span>`).join('')}${h.items.length > 4 ? `<span>+${h.items.length - 4}</span>` : ''}</div>` : ''}
    </button>`;
  }).join('')}<button class="person new" data-act="new" style="--i:${list.length}"><span class="av">${icon('plus')}</span>Nova pessoa</button></div>`;
  countUp($('#pesBody'));
}

function personView(h) {
  const t = totals(h);
  $('#pesTitle').textContent = h.name;
  $('#pesInfo').innerHTML = `<b data-count="${t.pecas}">0</b> tipos de peça · <b data-count="${t.unidades}">0</b> unidades com ${esc(h.name)}`;
  $('#pesActs').innerHTML = `<button class="btn ghost" data-act="edit">${icon('edit')}Editar</button><button class="btn blue" data-act="give">${icon('send')}Entregar peça</button>`;
  const items = h.items.map(it => ({ ...it, p: byId(it.product_id) })).filter(x => x.p).sort((a, b) => a.p.name.localeCompare(b.p.name, 'pt-BR'));
  $('#pesBody').innerHTML = (items.length ? `<div class="hitems">${items.map((x, i) => `<div class="hitem" data-pid="${x.p.id}" style="--i:${i}">
      <div class="ph" data-detail>${x.p.photo ? `<img src="${esc(x.p.photo)}" alt="" loading="lazy">` : `<div class="none">${icon('photo')}</div>`}</div>
      <div class="info"><h3>${esc(x.p.name)}</h3><p>${esc(x.p.category || 'Sem categoria')} · #${x.p.id} · no estoque: ${n(x.p.quantity)}</p></div>
      <div class="q">${n(x.quantity)}<small>${unit(x.p)}</small></div>
      <div class="row"><button class="btn sm ok" data-act="back">${icon('back')}Devolver</button><button class="btn sm blue" data-act="use">${icon('pin')}Dar baixa</button></div>
    </div>`).join('')}</div>`
    : `<div class="empty"><span class="ill" style="background:var(--blue-bg);color:var(--blue)">${icon('user')}</span><b>${esc(h.name)} não está com nenhuma peça</b><span>Use “Entregar peça” ou registre uma saída para ${esc(h.name)} no estoque.</span><button class="btn blue" data-act="give">${icon('send')}Entregar peça</button></div>`)
    + `<h2 class="sectionTitle">${icon('clock')}Movimentações de ${esc(h.name)}</h2><div class="panel table"><table><thead><tr><th>Data</th><th>Peça</th><th>Tipo</th><th class="n">Alteração</th><th class="n">Antes</th><th class="n">Depois</th><th>Para / de onde</th><th>Observação</th></tr></thead><tbody id="pesHist">${hist.id === h.id ? historyRows(hist.rows) : '<tr><td colspan="8" class="muted" style="text-align:center;padding:24px">Carregando…</td></tr>'}</tbody></table></div>`;
  countUp($('#pesInfo'));
  if (hist.id !== h.id) loadHist(h.id);
}
async function loadHist(id) {
  try { const rows = await api('/api/history?limit=100&holder=' + id); hist = { id, rows }; const tb = $('#pesHist'); if (tb && sel === String(id)) tb.innerHTML = historyRows(rows); }
  catch (e) { hist = { id, rows: [] }; const tb = $('#pesHist'); if (tb) tb.innerHTML = historyRows([]); }
}

export function render() {
  if ($('#v-pessoas').hidden) return;
  const list = activeHolders();
  if (sel !== 'todos' && !list.some(h => String(h.id) === sel)) sel = 'todos';
  subtabs($('#pesSub'), [{ key: 'todos', label: 'Visão geral', accent: 'var(--ink)', count: list.length },
    ...list.map(h => ({ key: String(h.id), label: h.name, accent: personColor(h.id), dot: true, count: totals(h).unidades })),
    { key: 'novo', label: '+ Pessoa', cls: 'add' }], sel, k => {
      if (k === 'novo') return editHolder(null, created);
      sel = k; render();
    });
  if (sel === 'todos') overview(list); else personView(list.find(h => String(h.id) === sel));
}
async function created(id) { await reload(); if (id) sel = String(id); hist.id = null; render(); }
const done = async () => { hist.id = null; await reload(); document.dispatchEvent(new CustomEvent('stock:changed')); render(); };

export function load() { render(); }
export function init() {
  subscribe(render);
  $('#v-pessoas').addEventListener('click', e => {
    const o = e.target.closest('[data-open]'); if (o) { sel = o.dataset.open; render(); scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const a = e.target.closest('[data-act]'), item = e.target.closest('.hitem');
    const h = state.holders.find(x => String(x.id) === sel);
    if (e.target.closest('[data-detail]') && item) return openDetail(+item.dataset.pid);
    if (!a) return;
    const act = a.dataset.act, p = item && byId(+item.dataset.pid);
    if (act === 'new') return editHolder(null, created);
    if (act === 'edit') return editHolder(h, async () => { await reload(); hist.id = null; render(); });
    if (act === 'give') return openMove({ kind: 'saida', holderId: h.id, done });
    if (act === 'back') return openMove({ kind: 'entrada', product: p, holderId: h.id, done });
    if (act === 'use') return openMove({ kind: 'consumo', product: p, holderId: h.id, done });
  });
  document.addEventListener('stock:changed', () => { hist.id = null; });
}
