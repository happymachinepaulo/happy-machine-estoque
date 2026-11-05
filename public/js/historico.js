import { $, fold, api, toast, subtabs } from './core.js';
import { state } from './state.js';
import { historyRows } from './estoque.js';
let rows = [], kind = '';
const KINDS = [['', 'Todos', 'var(--red-l)'], ['entrada', 'Adicionados', 'var(--capri)'], ['saida', 'Saídas', 'var(--red)'], ['consumo', 'Baixas de pessoas', 'var(--orange)'], ['ajuste', 'Ajustes', 'var(--rosa)'], ['cadastro', 'Cadastros', 'var(--pink)']];
function tabs() { subtabs($('#histSub'), KINDS.map(([k, l, c]) => ({ key: k, label: l, accent: c })), kind, k => { kind = k; tabs(); load(); }); }
function render() {
  const q = fold($('#hq').value.trim()), names = new Map(state.holders.map(h => [h.id, h.name]));
  $('#hbody').innerHTML = historyRows(rows.filter(m => !q || fold(`${m.product_name} ${m.note} ${m.destination || ''} ${names.get(m.holder_id) || ''}`).includes(q)));
}
export async function load() {
  tabs();
  try { rows = await api('/api/history?limit=300' + (kind ? '&kind=' + kind : '')); render(); } catch (e) { toast(e.message, true); }
}
export function init() { $('#hq').oninput = render; }
