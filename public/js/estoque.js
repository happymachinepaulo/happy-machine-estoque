import { $, $$, esc, fold, n, icon, api, download, toast, open, debounce, confirmBox, zoom, prepareImage, pickPhoto, fmtDate, kindLabel } from './core.js';
import { state, setData, subscribe, patch } from './state.js';

const F = { q: '', cat: '', chip: 'todas', sort: 'name', list: false };
try { F.list = localStorage.getItem('hm-list') === '1'; } catch {}
let current = null, photoPick = null, reviewPhoto = null, loading = false;

const isPending = p => p.review_status === 'pendente';
const isUnknown = p => isPending(p) && p.quantity === 0 && !p.broken;
const isLow = p => !isPending(p) && p.min_quantity > 0 && p.quantity <= p.min_quantity;
const unitLabel = p => p.unit === 'm' ? 'm' : p.unit === 'lote' ? (p.quantity === 1 ? 'lote' : 'lotes') : 'un';
export const bigUnit = p => p.unit === 'm' ? 'metros' : p.unit === 'lote' ? (p.quantity === 1 ? 'lote' : 'lotes') : (p.quantity === 1 ? 'unidade' : 'unidades');

function qtyTag(p) {
  if (isUnknown(p)) return `<div class="qty check"><b>?</b><span>a contar</span></div>`;
  const cls = isPending(p) ? 'check' : isLow(p) ? 'low' : p.quantity === 0 ? 'zero' : '';
  return `<div class="qty ${cls}"><b>${n(p.quantity)}</b><span>${unitLabel(p)}${isPending(p) ? ' · conferir' : ''}</span></div>`;
}
const card = p => `<button class="card" data-id="${p.id}" aria-label="${esc(p.name)}, ${p.quantity} ${unitLabel(p)}">
  <div class="ph">${p.photo ? `<img src="${esc(p.photo)}" alt="" loading="lazy" decoding="async" width="400" height="300">` : `<div class="none">${icon('photo')}Sem foto</div>`}${qtyTag(p)}${p.photo_count > 1 ? `<span class="tag">${p.photo_count} fotos</span>` : ''}</div>
  <div class="cbody"><div class="cat"><span>${esc(p.category || 'Sem categoria')}</span><span>#${p.id}</span></div><h3>${esc(p.name)}</h3></div></button>`;

function filtered() {
  const q = fold(F.q.trim());
  let rows = state.products.filter(p =>
    (!F.cat || p.category === F.cat) && (!q || p._s.includes(q)) &&
    (F.chip === 'todas' || (F.chip === 'conferir' && isPending(p)) || (F.chip === 'baixo' && isLow(p)) || (F.chip === 'semfoto' && !p.photo_id)));
  const by = { name: (a, b) => a.name.localeCompare(b.name, 'pt-BR'), 'qty-desc': (a, b) => b.quantity - a.quantity, 'qty-asc': (a, b) => a.quantity - b.quantity, recent: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || '') };
  return rows.sort(by[F.sort]);
}

export function render() {
  const P = state.products, ok = P.filter(p => !isPending(p));
  const units = ok.filter(p => p.unit === 'un').reduce((s, p) => s + p.quantity, 0);
  $('#summary').innerHTML = P.length ? `<b>${n(ok.length)}</b> peças conferidas · <b>${n(units)}</b> unidades` : '';
  const counts = { todas: P.length, conferir: P.filter(isPending).length, baixo: P.filter(isLow).length, semfoto: P.filter(p => !p.photo_id).length };
  $('#chips').innerHTML = [['todas', 'Todas'], ['conferir', 'A conferir'], ['baixo', 'Estoque baixo'], ['semfoto', 'Sem foto']]
    .map(([k, l]) => `<button class="chip" data-chip="${k}" aria-pressed="${F.chip === k}">${l}<small>${n(counts[k])}</small></button>`).join('');
  const cats = [...new Map(P.filter(p => p.category).map(p => [p.category, 0])).keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  $('#cat').innerHTML = '<option value="">Todas as categorias</option>' + cats.map(c => `<option ${c === F.cat ? 'selected' : ''}>${esc(c)}</option>`).join('');
  $('#dlCats').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
  const rows = filtered(), el = $('#cards');
  el.classList.toggle('list', F.list);
  el.innerHTML = rows.length ? rows.map(card).join('') :
    loading ? Array(12).fill('<div class="skel"></div>').join('') :
    `<div class="empty" style="grid-column:1/-1"><b>${P.length ? 'Nenhuma peça encontrada' : 'Nenhuma peça cadastrada'}</b><span>${P.length ? 'Tente outro nome ou limpe os filtros.' : 'Cadastre a primeira peça para começar.'}</span>${P.length ? '<button class="btn" id="clear">Limpar filtros</button>' : ''}</div>`;
  const badge = $('#badgeFotos'); badge.textContent = state.pending; badge.classList.toggle('hidden', !state.pending);
}

export async function reload(silent = true) {
  loading = !state.products.length; if (loading) render();
  try { setData(await api('/api/boot')); } catch (e) { if (!silent) toast(e.message, true); } finally { loading = false; render(); }
}

/* ── detalhe ── */
async function openDetail(id) {
  try {
    const p = current = await api('/api/products/' + id);
    const list = state.products.find(x => x.id === id) || p;
    $('#dName').textContent = p.name; $('#dSub').textContent = `${p.category || 'Sem categoria'} · #${p.id}`;
    $('#dQty').innerHTML = isUnknown(p) ? 'A contar' : `${n(p.quantity)}<small>${bigUnit(p)}</small>`;
    $('#dMin').textContent = p.min_quantity > 0 ? `Estoque mínimo: ${p.min_quantity}` : 'Sem estoque mínimo';
    $('#dWarn').classList.toggle('hidden', p.review_status !== 'pendente');
    $('#dNotes').textContent = p.notes || 'Sem observações.';
    gallery(p, 0);
    $('#dHist').innerHTML = historyRows(p.movements, false);
    open($('#dDetail'));
  } catch (e) { toast(e.message, true); }
}
function gallery(p, i) {
  const ph = p.photos[i];
  $('#dGal').innerHTML = ph ? `<div class="main" data-zoom="${esc(ph.url)}"><img src="${esc(ph.url)}" alt="${esc(p.name)}"></div>` +
    (p.photos.length > 1 ? `<div class="thumbs">${p.photos.map((x, k) => `<button data-g="${k}" aria-current="${k === i}" aria-label="Foto ${k + 1}"><img src="${esc(x.thumb)}" alt="" loading="lazy"></button>`).join('')}</div>` : '') +
    `<div class="acts2">${ph.is_primary ? '<span class="pill ok">Foto principal</span>' : `<button class="btn sm" data-primary="${ph.id}">Usar como principal</button>`}<button class="btn sm ghost" data-unlink="${ph.id}">Enviar para revisão</button></div>`
    : `<div class="main" style="display:grid;place-content:center;justify-items:center;gap:8px;cursor:default;color:var(--ink-3)">${icon('photo')}<span>Sem foto</span><button class="btn sm" id="addPhoto">Adicionar foto</button></div>`;
}
export function historyRows(rows, withName = true) {
  return rows.map(m => `<tr><td>${esc(fmtDate(m.created_at))}</td>${withName ? `<td>${esc(m.product_name)}</td>` : ''}<td><span class="pill ${esc(m.kind)}">${kindLabel(m.kind)}</span></td><td class="n"><span class="delta ${m.amount > 0 ? 'plus' : m.amount < 0 ? 'minus' : ''}">${m.amount > 0 ? '+' : ''}${m.amount}</span></td><td class="n">${n(m.before_qty)}</td><td class="n">${n(m.after_qty)}</td><td>${esc(m.note || '—')}</td></tr>`).join('')
    || `<tr><td colspan="${withName ? 7 : 6}" class="muted" style="text-align:center;padding:28px">Nenhuma movimentação.</td></tr>`;
}

/* ── formulário ── */
function resetForm() {
  $('#formProduct').reset(); $('#pId').value = ''; reviewPhoto = null; photoPick.clear();
  $('#pQtyWrap').classList.remove('hidden'); $('#pPhotoWrap').classList.remove('hidden'); $('#pTitle').textContent = 'Nova peça'; $('#pSub').textContent = 'Foto, nome e quantidade.';
}
export function newFromPhoto(photo, suggestion) {
  resetForm(); reviewPhoto = photo.id; $('#pTitle').textContent = 'Criar peça com esta foto'; $('#pSub').textContent = 'Identifique a peça e informe a quantidade contada.';
  $('#pName').value = suggestion.name || ''; $('#pCat').value = suggestion.category || ''; $('#pNotes').value = photo.review_note || ''; $('#pQty').value = '';
  $('#pPreview').src = photo.url; $('#pPreview').classList.remove('hidden'); $('#pFile').closest('div').classList.add('hidden'); open($('#dProduct')); $('#pName').focus();
}
async function saveProduct(e) {
  e.preventDefault(); const id = $('#pId').value, btn = e.submitter; btn.disabled = true;
  try {
    const fd = new FormData();
    fd.set('name', $('#pName').value); fd.set('category', $('#pCat').value); fd.set('min_quantity', $('#pMin').value || 0); fd.set('notes', $('#pNotes').value);
    if (!id) fd.set('quantity', $('#pQty').value || 0);
    if (reviewPhoto) fd.set('existing_photo_id', reviewPhoto);
    else if (photoPick.file) { const { photo, thumb } = await prepareImage(photoPick.file); fd.set('photo', photo, 'foto.jpg'); if (thumb) fd.set('thumb', thumb, 'thumb.jpg'); }
    const r = await api(id ? `/api/products/${id}/update` : '/api/products', { method: 'POST', body: fd });
    $('#dProduct').close(); toast(id ? 'Peça atualizada' : 'Peça cadastrada');
    const wasReview = reviewPhoto; reviewPhoto = null;
    await reload(); document.dispatchEvent(new CustomEvent('stock:changed'));
    if (wasReview) openDetail(r.id); else if (id && $('#dDetail').open) openDetail(+id);
  } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
}

/* ── movimentação ── */
function openMove(kind) {
  const p = current; if (!p) return;
  $('#mKind').value = kind; $('#mTitle').textContent = { entrada: 'Registrar entrada', saida: 'Registrar saída', ajuste: 'Ajustar contagem' }[kind];
  $('#mSub').textContent = `${p.name} · estoque atual: ${isUnknown(p) ? 'a contar' : n(p.quantity)}`;
  $('#mAmt').value = 1; $('#mAmt').required = kind !== 'ajuste'; $('#mNew').value = isUnknown(p) ? '' : p.quantity; $('#mNew').required = kind === 'ajuste';
  $('#mAmtWrap').classList.toggle('hidden', kind === 'ajuste'); $('#mNewWrap').classList.toggle('hidden', kind !== 'ajuste'); $('#mNote').value = '';
  open($('#dMove')); $(kind === 'ajuste' ? '#mNew' : '#mAmt').select();
}
async function saveMove(e) {
  e.preventDefault(); const kind = $('#mKind').value, btn = e.submitter, p = current; btn.disabled = true;
  try {
    const body = { kind, note: $('#mNote').value }; if (kind === 'ajuste') body.new_quantity = +$('#mNew').value; else body.amount = +$('#mAmt').value;
    const r = await api(`/api/products/${p.id}/movement`, { json: body });
    patch(p.id, { quantity: r.after, updated_at: new Date().toISOString() }); $('#dMove').close(); toast('Estoque atualizado');
    await openDetail(p.id); reload();
  } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
}

export function init() {
  photoPick = pickPhoto([$('#pFile'), $('#pCam')], $('#pPreview'));
  subscribe(render);
  $('#q').addEventListener('input', debounce(e => { F.q = e.target.value; render(); }, 120));
  $('#cat').onchange = e => { F.cat = e.target.value; render(); };
  $('#sort').onchange = e => { F.sort = e.target.value; render(); };
  const layout = list => { F.list = list; $('#vList').setAttribute('aria-pressed', list); $('#vGrid').setAttribute('aria-pressed', !list); try { localStorage.setItem('hm-list', list ? '1' : '0'); } catch {} render(); };
  $('#vGrid').onclick = () => layout(false); $('#vList').onclick = () => layout(true); layout(F.list);
  $('#chips').onclick = e => { const b = e.target.closest('[data-chip]'); if (b) { F.chip = b.dataset.chip; render(); } };
  $('#cards').onclick = e => { const c = e.target.closest('.card'); if (c) openDetail(+c.dataset.id); else if (e.target.id === 'clear') { Object.assign(F, { q: '', cat: '', chip: 'todas' }); $('#q').value = ''; render(); } };
  $('#btnNew').onclick = () => { resetForm(); open($('#dProduct')); $('#pName').focus(); };
  $('#btnCsv').onclick = () => download('/api/export.csv', 'estoque.csv').catch(e => toast(e.message, true));
  $('#formProduct').onsubmit = saveProduct; $('#formMove').onsubmit = saveMove;
  $('#bIn').onclick = () => openMove('entrada'); $('#bOut').onclick = () => openMove('saida'); $('#bAdj').onclick = () => openMove('ajuste');
  $('#bEdit').onclick = () => {
    const p = current; resetForm(); $('#pId').value = p.id; $('#pName').value = p.name; $('#pCat').value = p.category; $('#pMin').value = p.min_quantity; $('#pNotes').value = p.notes;
    $('#pQtyWrap').classList.add('hidden'); $('#pTitle').textContent = 'Editar peça'; $('#pSub').textContent = 'Para mudar a quantidade, use Entrada, Saída ou Ajustar.'; $('#dDetail').close(); open($('#dProduct'));
  };
  $('#bDel').onclick = async () => {
    if (!await confirmBox(`Excluir "${current.name}"?`, 'O histórico da peça será apagado. As fotos voltam para a revisão.', 'Excluir')) return;
    try { await api('/api/products/' + current.id, { method: 'DELETE' }); $('#dDetail').close(); toast('Peça excluída'); await reload(); document.dispatchEvent(new CustomEvent('stock:changed')); } catch (e) { toast(e.message, true); }
  };
  $('#dConfirm').onclick = async () => { try { await api(`/api/products/${current.id}/confirm`, { method: 'POST' }); toast('Peça confirmada'); await openDetail(current.id); reload(); } catch (e) { toast(e.message, true); } };
  $('#dGal').onclick = async e => {
    const z = e.target.closest('[data-zoom]'), g = e.target.closest('[data-g]'), pr = e.target.closest('[data-primary]'), un = e.target.closest('[data-unlink]');
    try {
      if (z) zoom(z.dataset.zoom, current.name);
      else if (g) gallery(current, +g.dataset.g);
      else if (pr) { await api(`/api/photos/${pr.dataset.primary}/review`, { json: { status: 'confirmada', product_id: current.id, primary: true } }); await openDetail(current.id); reload(); }
      else if (un) { await api(`/api/photos/${un.dataset.unlink}/review`, { json: { status: 'pendente', product_id: current.id, primary: false } }); toast('Foto enviada para revisão'); await openDetail(current.id); reload(); document.dispatchEvent(new CustomEvent('stock:changed')); }
      else if (e.target.id === 'addPhoto') $('#bEdit').click();
    } catch (err) { toast(err.message, true); }
  };
  document.addEventListener('keydown', e => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('dialog[open]')) { e.preventDefault(); location.hash = 'estoque'; $('#q').focus(); } });
}
export { openDetail };
