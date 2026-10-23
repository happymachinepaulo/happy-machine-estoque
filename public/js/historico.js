import { $, fold, api, toast } from './core.js';
import { historyRows } from './estoque.js';
let rows = [];
function render() {
  const q = fold($('#hq').value.trim());
  $('#hbody').innerHTML = historyRows(rows.filter(m => !q || fold(`${m.product_name} ${m.note}`).includes(q)));
}
export async function load() {
  try { rows = await api('/api/history?limit=300' + ($('#hkind').value ? '&kind=' + $('#hkind').value : '')); render(); } catch (e) { toast(e.message, true); }
}
export function init() { $('#hq').oninput = render; $('#hkind').onchange = load; }
