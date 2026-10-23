import { $, esc, fold, n, icon, api, toast, open, confirmBox, prepareImage, pickPhoto, fmtDate } from './core.js';

const LABEL = { aguardando: 'Aguardando', em_conserto: 'Em conserto', consertada: 'Consertada', sem_conserto: 'Sem conserto' };
const PILL = { aguardando: 'warn', em_conserto: '', consertada: 'ok', sem_conserto: 'bad' };
let rows = [], pick;
const notes = r => (r.notes || '').replace(/\[paulo-quebradas-20261009:\d+\]/g, '').trim();
const options = s => Object.entries(LABEL).map(([k, v]) => `<option value="${k}" ${k === s ? 'selected' : ''}>${v}</option>`).join('');

function render() {
  const t = fold($('#rq').value.trim()), st = $('#rfilter').value;
  const list = rows.filter(r => (!st || r.status === st) && (!t || fold(`${r.name} ${r.category} ${r.defect} ${r.notes}`).includes(t)));
  $('#rstats').innerHTML = Object.keys(LABEL).map(s => `<div class="rstat"><span>${LABEL[s]}</span><b>${n(rows.filter(r => r.status === s).reduce((a, r) => a + r.quantity, 0))}</b></div>`).join('');
  $('#rcards').innerHTML = list.map(r => `<article class="panel rcard" data-id="${r.id}">
    <div class="top"><span class="pill ${PILL[r.status]}">${LABEL[r.status]}</span><span class="muted" style="font-size:12px">C${String(r.id).padStart(3, '0')} · ${esc(fmtDate(r.updated_at))}</span></div>
    <div class="id"><div class="ph">${r.photo ? `<img src="${esc(r.photo)}" alt="" loading="lazy" decoding="async">` : `<div class="none">${icon('wrench')}</div>`}</div>
      <div><div class="muted" style="font-size:12px">${esc(r.category || 'Sem categoria')}</div><h3>${esc(r.name)}</h3><b>${n(r.quantity)}</b> <span class="muted">un.</span></div></div>
    <p class="defect">${esc(r.defect)}</p>${notes(r) ? `<p class="defect muted">${esc(notes(r))}</p>` : ''}
    <div style="display:flex;gap:8px;align-items:center"><select class="control" data-status aria-label="Situação de ${esc(r.name)}">${options(r.status)}</select><button class="btn sm" data-edit>Editar</button><button class="btn sm ghost" data-archive>Arquivar</button></div></article>`).join('')
    || `<div class="empty" style="grid-column:1/-1"><b>Nenhuma peça nesta seleção</b><span>Registre as peças quebradas que aguardam conserto.</span></div>`;
}
export async function load() { try { rows = await api('/api/repairs'); render(); } catch (e) { toast(e.message, true); } }
async function save(r, file) {
  const fd = new FormData(); for (const k of ['name', 'category', 'quantity', 'defect', 'notes', 'status', 'updated_at']) if (r[k] !== undefined && r[k] !== null) fd.set(k, r[k]);
  if (file) { const { photo } = await prepareImage(file); fd.set('photo', photo, 'foto.jpg'); }
  return api(r.id ? `/api/repairs/${r.id}/update` : '/api/repairs', { method: 'POST', body: fd });
}
function edit(r) {
  $('#formRepair').reset(); pick.clear(); $('#rId').value = r?.id || ''; $('#rUpd').value = r?.updated_at || '';
  $('#rTitle').textContent = r ? 'Editar peça em conserto' : 'Registrar peça quebrada';
  if (r) { $('#rName').value = r.name; $('#rCat').value = r.category; $('#rQty').value = r.quantity; $('#rDefect').value = r.defect; $('#rNotes').value = r.notes; $('#rStatus').value = r.status; if (r.photo) { $('#rPreview').src = r.photo; $('#rPreview').classList.remove('hidden'); } }
  open($('#dRepair')); $('#rName').focus();
}
export function init() {
  pick = pickPhoto([$('#rFile'), $('#rCam')], $('#rPreview'));
  $('#btnRepair').onclick = () => edit(); $('#rq').oninput = render; $('#rfilter').onchange = render;
  $('#formRepair').onsubmit = async e => {
    e.preventDefault(); const btn = e.submitter; btn.disabled = true;
    try {
      const r = { id: $('#rId').value || null, name: $('#rName').value, category: $('#rCat').value, quantity: $('#rQty').value, defect: $('#rDefect').value, notes: $('#rNotes').value, status: $('#rStatus').value };
      if (r.id) r.updated_at = $('#rUpd').value;
      await save(r, pick.file); $('#dRepair').close(); toast('Peça registrada'); await load();
    } catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  };
  $('#rcards').onclick = async e => {
    const c = e.target.closest('.rcard'); if (!c) return; const r = rows.find(x => x.id === +c.dataset.id);
    try {
      if (e.target.closest('[data-edit]')) edit(r);
      else if (e.target.closest('[data-archive]') && await confirmBox(`Arquivar ${r.name}?`, 'O registro continua guardado na cópia de segurança.', 'Arquivar')) { await api(`/api/repairs/${r.id}/archive`, { json: { updated_at: r.updated_at } }); toast('Registro arquivado'); load(); }
    } catch (err) { toast(err.message, true); }
  };
  $('#rcards').onchange = async e => {
    const s = e.target.closest('[data-status]'); if (!s) return; const r = rows.find(x => x.id === +s.closest('.rcard').dataset.id);
    s.disabled = true; try { await save({ ...r, status: s.value }); toast('Situação atualizada'); await load(); } catch (err) { toast(err.message, true); s.value = r.status; s.disabled = false; }
  };
}
