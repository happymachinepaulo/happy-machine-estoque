import { $, esc, fold, n, icon, api, toast, zoom, debounce } from './core.js';
import { state } from './state.js';
import { reload, newFromPhoto, openDetail } from './estoque.js';

const SIZE = 24;
let page = 0, data = { rows: [], total: 0 };

const key = s => (fold(s).match(/[a-z0-9]+/g) || []).map((w, i) => i === 0 && w === 'chaves' ? 'chave' : w).join('');
const field = (note, label) => (String(note || '').split('\n').find(l => l.startsWith(label + ': ')) || '').slice(label.length + 2);
function suggestion(ph) {
  const note = ph.review_note || '';
  return { name: field(note, 'Nome sugerido'), category: field(note, 'Categoria sugerida'), count: field(note, 'Contagem sugerida') };
}
function existing(ph) {
  const line = String(ph.review_note || '').split('\n').find(l => l.startsWith('Cadastros existentes da revisão:')) || '';
  const ids = new Set([ph.product_id, ...[...line.matchAll(/#(\d+)/g)].map(m => +m[1])].filter(Boolean));
  const byId = state.products.filter(p => ids.has(p.id));
  if (byId.length === 1) return byId[0];
  if (byId.length > 1) return null;
  const k = key(suggestion(ph).name), named = k ? state.products.filter(p => key(p.name) === k) : [];
  return named.length === 1 ? named[0] : null;
}
const label = { confirmada: ['ok', 'Vinculada'], pendente: ['warn', 'Para revisar'], oculta: ['', 'Oculta'] };

function render() {
  const status = $('#fotoStatus').value;
  $('#dlProducts').innerHTML = state.products.map(p => `<option value="${p.id} · ${esc(p.name)}">`).join('');
  $('#fotosInfo').textContent = data.total ? `${n(data.total)} ${data.total === 1 ? 'foto' : 'fotos'} nesta seleção` : '';
  $('#fotoList').innerHTML = data.rows.length ? data.rows.map(ph => {
    const s = suggestion(ph), ex = existing(ph), [cls, txt] = label[ph.review_status] || label.pendente;
    return `<article class="panel rv" data-id="${ph.id}">
      <div class="ph" data-zoom="${esc(ph.url)}" data-cap="${esc(ph.filename)}"><img src="${esc(ph.thumb)}" alt="" loading="lazy" decoding="async"></div>
      <div class="in"><div style="display:flex;justify-content:space-between;align-items:center"><span class="pill ${cls}">${txt}</span><span class="muted" style="font-size:12px">Foto ${ph.id}</span></div>
        <h3>${esc(ph.product_name || s.name || 'Qual é esta peça?')}</h3>
        ${s.count ? `<div class="hint">${esc(s.count)}</div>` : ''}
        ${ph.review_note ? `<details><summary class="muted" style="cursor:pointer;font-size:13px">Detalhes</summary><p class="notes" style="margin-top:6px">${esc(ph.review_note)}</p></details>` : ''}
        <label class="field">Vincular a uma peça<input class="control link" list="dlProducts" placeholder="Digite o nome ou o código" value="${ph.product_id ? `${ph.product_id} · ${esc(ph.product_name || '')}` : ''}"></label>
        <div class="row"><button class="btn primary sm" data-act="link">${icon('check')}Vincular</button>${ph.review_status !== 'confirmada' ? (ex ? `<button class="btn sm" data-act="open" data-pid="${ex.id}">Abrir #${ex.id}</button>` : `<button class="btn sm" data-act="create">${icon('plus')}Criar peça</button>`) : ''}<button class="btn sm ghost" data-act="hide">${ph.review_status === 'oculta' ? 'Restaurar' : 'Ocultar'}</button></div>
        ${ex && ph.review_status !== 'confirmada' ? `<button class="btn sm ok" data-act="suggest" data-pid="${ex.id}">Vincular a “${esc(ex.name)}”</button>` : ''}
      </div></article>`;
  }).join('') : `<div class="empty" style="grid-column:1/-1"><b>${status === 'pendente' ? 'Tudo revisado' : 'Nenhuma foto nesta seleção'}</b><span>Escolha outra situação para ver as demais fotos.</span></div>`;
  const pages = Math.max(1, Math.ceil(data.total / SIZE)), pg = $('#fotoPager');
  pg.classList.toggle('hidden', pages <= 1);
  pg.innerHTML = `<button class="btn sm" data-p="-1" ${page === 0 ? 'disabled' : ''}>Anterior</button><span>Página ${page + 1} de ${pages}</span><button class="btn sm" data-p="1" ${page >= pages - 1 ? 'disabled' : ''}>Próxima</button>`;
}

export async function load() {
  try {
    data = await api(`/api/review?status=${$('#fotoStatus').value}&limit=${SIZE}&offset=${page * SIZE}`);
    if (!data.rows.length && page > 0) { page--; return load(); }
    render();
  } catch (e) { toast(e.message, true); }
}
async function act(ph, status, pid, primary = true) { await api(`/api/photos/${ph.id}/review`, { json: { status, product_id: pid, primary } }); }
async function changed(msg) { toast(msg); await Promise.all([load(), reload()]); }

export function init() {
  $('#fotoStatus').onchange = () => { page = 0; load(); };
  $('#fotoPager').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { page += +b.dataset.p; load(); scrollTo({ top: 0 }); } };
  $('#fotoList').onclick = async e => {
    const z = e.target.closest('[data-zoom]'); if (z) return zoom(z.dataset.zoom, z.dataset.cap);
    const b = e.target.closest('[data-act]'); if (!b) return;
    const ph = data.rows.find(r => r.id === +b.closest('.rv').dataset.id), a = b.dataset.act;
    try {
      if (a === 'open') return openDetail(+b.dataset.pid);
      if (a === 'create') return newFromPhoto(ph, suggestion(ph));
      if (a === 'hide') { await act(ph, ph.review_status === 'oculta' ? 'pendente' : 'oculta', ph.product_id, false); return changed(ph.review_status === 'oculta' ? 'Foto devolvida à revisão' : 'Foto ocultada'); }
      let pid = +b.dataset.pid;
      if (a === 'link') {
        const v = b.closest('.rv').querySelector('.link').value, k = fold(v);
        const m = state.products.find(p => `${p.id} · ${p.name}` === v || String(p.id) === v.trim() || fold(p.name) === k);
        if (!m) return toast('Escolha uma peça da lista.', true); pid = m.id;
      }
      b.disabled = true; await act(ph, 'confirmada', pid); await changed('Foto vinculada');
    } catch (err) { toast(err.message, true); b.disabled = false; }
  };
  document.addEventListener('stock:changed', () => { if (!$('#v-fotos').hidden) load(); });
}
