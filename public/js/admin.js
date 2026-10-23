import { $, esc, api, download, toast } from './core.js';
let users = [];
function render() {
  $('#ubody').innerHTML = users.map(u => `<tr><td><b>${esc(u.name || 'Sem nome')}</b></td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Administrador' : 'Operador'}</td><td><span class="pill ${u.active ? 'ok' : 'bad'}">${u.active ? 'Ativo' : 'Desativado'}</span></td>
    <td class="n">${u.role === 'admin' ? '<span class="muted">Conta principal</span>' : `<button class="btn sm ${u.active ? 'bad' : ''}" data-user="${u.id}">${u.active ? 'Desativar' : 'Ativar'}</button>`}</td></tr>`).join('');
}
export async function load() { try { users = await api('/api/admin/users'); render(); } catch (e) { toast(e.message, true); } }
export function init() {
  $('#btnBackup').onclick = () => download('/api/backup', 'estoque_online.json').catch(e => toast(e.message, true));
  $('#ubody').onclick = async e => {
    const b = e.target.closest('[data-user]'); if (!b) return; const u = users.find(x => x.id === b.dataset.user); b.disabled = true;
    try { await api(`/api/admin/users/${u.id}/active`, { json: { active: !u.active } }); toast('Acesso atualizado'); load(); } catch (err) { toast(err.message, true); b.disabled = false; }
  };
  $('#formUser').onsubmit = async e => {
    e.preventDefault(); const b = e.submitter; b.disabled = true; $('#cred').classList.add('hidden');
    try {
      const d = await api('/api/admin/users', { json: { name: $('#uName').value.trim(), email: $('#uEmail').value.trim() } });
      $('#credEmail').textContent = d.email; $('#credPass').textContent = d.password; $('#cred').classList.remove('hidden'); e.target.reset(); load();
    } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
  };
  $('#credOk').onclick = () => { $('#credPass').textContent = ''; $('#cred').classList.add('hidden'); };
}
