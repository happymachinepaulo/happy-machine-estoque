/* Janela de movimentação: Adicionar / Saída / Ajustar / Baixa da pessoa.
   Saída vai para uma pessoa (mini estoque) ou para um lugar/motivo (com "Outros" + texto livre).
   Adicionar vem de uma pessoa (devolução) ou de outra origem (com "Outros" + texto livre). */
import { $, $$, esc, n, api, toast, open, fold, personColor, initials } from './core.js';
import { state, activeHolders } from './state.js';

const PLACES = {
  saida: ['Uso em máquina', 'Cliente', 'Evento', 'Descarte / perda', 'Outros'],
  entrada: ['Compra', 'Fornecedor', 'Conserto concluído', 'Devolução de cliente', 'Outros'],
  consumo: ['Uso em máquina', 'Cliente', 'Evento', 'Perda / quebra', 'Outros'],
};
let ctx = null;   // { kind, product, holderId, mode, place, done }

const unitOf = p => p?.unit === 'm' ? 'm' : p?.unit === 'lote' ? 'lote(s)' : 'un';
export const holderQty = (p, hid) => (p?._with || []).find(w => w.holder.id === hid)?.quantity || 0;
export const findProduct = v => {
  const k = fold(String(v || '').trim()); if (!k) return null;
  return state.products.find(p => `${p.id} · ${p.name}` === v || String(p.id) === v.trim() || fold(p.name) === k) || null;
};

function renderPeople() {
  const p = ctx.product, entrada = ctx.kind === 'entrada';
  let list = activeHolders();
  if (entrada) list = list.filter(h => holderQty(p, h.id) > 0);
  $('#mPeople').innerHTML = (list.length ? list.map((h, i) => {
    const q = holderQty(p, h.id);
    return `<button type="button" data-holder="${h.id}" aria-pressed="${ctx.holderId === h.id}" style="--i:${i};--c:${personColor(h.id)}"><i>${esc(initials(h.name))}</i>${esc(h.name)}${q ? `<small>${n(q)} ${unitOf(p)}</small>` : ''}</button>`;
  }).join('') : `<span class="none">${entrada ? (p ? 'Ninguém está com esta peça.' : 'Escolha a peça primeiro.') : 'Nenhuma pessoa cadastrada.'}</span>`)
    + (entrada ? '' : `<button type="button" class="addp" data-newholder>+ Nova pessoa</button>`);
}
function renderPlaces() {
  $('#mPlaces').innerHTML = PLACES[ctx.kind === 'ajuste' ? 'saida' : ctx.kind].map((l, i) => `<button type="button" class="noav" data-place="${esc(l)}" aria-pressed="${ctx.place === l}" style="--i:${i}">${esc(l)}</button>`).join('');
  $('#mOtherWrap').hidden = ctx.place !== 'Outros';
}
function setMode(mode) {
  ctx.mode = mode; $('#mMode').dataset.mode = mode;
  $$('#mMode [data-mode]').forEach(b => b.setAttribute('aria-selected', b.dataset.mode === mode));
  $('#mPanePessoa').hidden = mode !== 'pessoa'; $('#mPaneLugar').hidden = mode !== 'lugar';
  $('#mMode .segInk').style.background = mode === 'pessoa' ? 'var(--blue)' : 'var(--ink)';
}
function subtitle() {
  const p = ctx.product;
  if (!p) { $('#mSub').textContent = 'Escolha a peça que vai para esta pessoa.'; return; }
  if (ctx.kind === 'consumo') { $('#mSub').textContent = `${p.name} · com ${ctx.holder?.name}: ${n(holderQty(p, ctx.holderId))} ${unitOf(p)}`; return; }
  $('#mSub').textContent = `${p.name} · no estoque: ${p.review_status === 'pendente' && p.quantity === 0 ? 'a contar' : n(p.quantity) + ' ' + unitOf(p)}${p._out ? ` · com pessoas: ${n(p._out)}` : ''}`;
}

/* opts: { kind:'entrada'|'saida'|'ajuste'|'consumo', product?, holderId?, done? } */
export function openMove(opts) {
  ctx = { mode: 'pessoa', place: null, holderId: null, ...opts };
  if (ctx.product) ctx.product = state.products.find(x => x.id === ctx.product.id) || ctx.product;
  ctx.holder = state.holders.find(h => h.id === ctx.holderId) || null;
  const k = ctx.kind, p = ctx.product;
  $('#mKind').value = k;
  $('#mTitle').textContent = { entrada: 'Adicionar ao estoque', saida: 'Registrar saída', ajuste: 'Ajustar contagem', consumo: `Baixa de ${ctx.holder?.name || ''}` }[k];
  $('#mOk').textContent = { entrada: 'Adicionar', saida: 'Confirmar saída', ajuste: 'Salvar contagem', consumo: 'Dar baixa' }[k];
  $('#mOk').className = 'btn solid ' + (k === 'entrada' ? 'ok' : k === 'ajuste' ? 'primary' : k === 'consumo' ? 'blue' : 'bad');
  $('#mProdWrap').classList.toggle('hidden', !!p); $('#mProd').value = ''; $('#mProd').required = !p;
  $('#mWhoWrap').classList.toggle('hidden', k === 'ajuste');
  $('#mMode').classList.toggle('hidden', k === 'consumo');
  $('#mModeP').textContent = k === 'entrada' ? 'De uma pessoa' : 'Para uma pessoa';
  $('#mModeL').textContent = k === 'entrada' ? 'Outra origem' : 'Para um lugar';
  $('#mOther').placeholder = k === 'entrada' ? 'De onde veio?' : k === 'consumo' ? 'Onde foi usada?' : 'Para onde foi?';
  $('#mOther').value = ''; $('#mNote').value = ''; $('#mAmt').value = 1; $('#mAmt').required = k !== 'ajuste';
  $('#mAmtWrap').classList.toggle('hidden', k === 'ajuste'); $('#mNewWrap').classList.toggle('hidden', k !== 'ajuste');
  $('#mNew').value = p && !(p.review_status === 'pendente' && p.quantity === 0) ? p.quantity : ''; $('#mNew').required = k === 'ajuste';
  if (k === 'consumo') ctx.mode = 'lugar';
  else if (ctx.holderId) ctx.mode = 'pessoa';
  else if (k === 'entrada' && !(p?._out > 0)) ctx.mode = 'lugar';
  setMode(ctx.mode); renderPeople(); renderPlaces(); subtitle();
  open($('#dMove'));
  if (!p) $('#mProd').focus();
}

async function submit(e) {
  e.preventDefault(); const btn = e.submitter, k = ctx.kind; btn.disabled = true;
  try {
    const p = ctx.product || findProduct($('#mProd').value);
    if (!p) throw new Error('Escolha uma peça da lista.');
    const body = { kind: k, note: $('#mNote').value };
    if (k === 'ajuste') body.new_quantity = +$('#mNew').value;
    else {
      body.amount = +$('#mAmt').value;
      if (!(body.amount > 0)) throw new Error('Informe uma quantidade maior que zero.');
      if (ctx.mode === 'pessoa') {
        if (!ctx.holderId) throw new Error(k === 'entrada' ? 'Escolha de quem veio.' : 'Escolha para quem vai.');
        body.holder_id = ctx.holderId;
      } else {
        if (!ctx.place) throw new Error(k === 'entrada' ? 'Escolha de onde veio.' : k === 'consumo' ? 'Escolha onde foi usada.' : 'Escolha para onde foi.');
        const other = $('#mOther').value.trim();
        if (ctx.place === 'Outros' && !other) { $('#mOther').focus(); throw new Error('Especifique em "Outros".'); }
        body.destination = ctx.place === 'Outros' ? `Outros: ${other}` : ctx.place;
      }
    }
    const r = k === 'consumo'
      ? await api(`/api/holders/${ctx.holderId}/consume`, { json: { product_id: p.id, amount: body.amount, destination: body.destination, note: body.note } })
      : await api(`/api/products/${p.id}/movement`, { json: body });
    $('#dMove').close();
    const who = body.holder_id ? state.holders.find(h => h.id === body.holder_id)?.name : '';
    toast(k === 'saida' && who ? `Enviado para ${who}` : k === 'entrada' && who ? `Devolvido por ${who}` : k === 'consumo' ? 'Baixa registrada' : 'Estoque atualizado');
    await ctx.done?.(p, r);
  } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
}

/* ── pessoa: criar / renomear / arquivar ── */
let holderDone = null;
export function editHolder(h, done) {
  holderDone = done; $('#formHolder').reset(); $('#hId').value = h?.id || '';
  $('#hTitle').textContent = h ? `Editar ${h.name}` : 'Nova pessoa'; $('#hName').value = h?.name || '';
  $('#hArchive').classList.toggle('hidden', !h);
  open($('#dHolder')); $('#hName').focus();
}

export function init({ reload }) {
  $('#formMove').onsubmit = submit;
  $('#mMode').onclick = e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); };
  $('#mPeople').onclick = e => {
    if (e.target.closest('[data-newholder]')) return editHolder(null, async id => { await reload(); if (ctx && id) { ctx.holderId = id; renderPeople(); } });
    const b = e.target.closest('[data-holder]'); if (!b) return;
    ctx.holderId = +b.dataset.holder; renderPeople();
    if (ctx.kind === 'entrada' && ctx.product) $('#mAmt').value = Math.min(+$('#mAmt').value || 1, holderQty(ctx.product, ctx.holderId)) || 1;
  };
  $('#mPlaces').onclick = e => {
    const b = e.target.closest('[data-place]'); if (!b) return;
    ctx.place = b.dataset.place; renderPlaces(); if (ctx.place === 'Outros') $('#mOther').focus();
  };
  $('#mProd').addEventListener('change', () => { const p = findProduct($('#mProd').value); if (p) { ctx.product = p; subtitle(); renderPeople(); } });
  $('#mAmtWrap').addEventListener('click', e => {
    const b = e.target.closest('[data-step]'); if (!b) return;
    e.preventDefault(); $('#mAmt').value = Math.max(1, (+$('#mAmt').value || 0) + +b.dataset.step);
  });
  $('#formHolder').onsubmit = async e => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true; const id = $('#hId').value;
    try {
      const r = id ? await api(`/api/holders/${id}/update`, { json: { name: $('#hName').value.trim() } }) : await api('/api/holders', { json: { name: $('#hName').value.trim() } });
      $('#dHolder').close(); toast(id ? 'Pessoa atualizada' : 'Pessoa criada'); await holderDone?.(id ? +id : r.id);
    } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  };
  $('#hArchive').onclick = async () => {
    const id = +$('#hId').value;
    try { await api(`/api/holders/${id}/update`, { json: { active: false } }); $('#dHolder').close(); toast('Pessoa arquivada'); await holderDone?.(null); } catch (err) { toast(err.message, true); }
  };
}
