import { $, esc, api, download, toast, confirmBox } from './core.js';
let users = [], target = null, all = [], pw = null;
function showCred(title, d) { $('#credTitle').textContent = title; $('#credEmail').textContent = d.email; $('#credPass').textContent = d.password; $('#cred').classList.remove('hidden'); $('#cred').scrollIntoView({ block: 'nearest' }); }
function render() {
  $('#ubody').innerHTML = users.map(u => `<tr><td><b>${esc(u.name || 'Sem nome')}</b></td><td>${esc(u.email)}</td><td>${u.role === 'admin' ? 'Administrador' : 'Operador'}</td><td><span class="pill ${u.active ? 'ok' : 'bad'}">${u.active ? 'Ativo' : 'Desativado'}</span></td><td>${u.role === 'admin' ? '<span class="muted">—</span>' : !pw ? '<span class="muted">••••••</span>' : pw[u.id] ? `<code class="pwShow">${esc(pw[u.id].password)}</code>` : '<span class="muted">Não guardada. Gere uma nova.</span>'}</td>
    <td class="n">${u.role === 'admin' ? '<span class="muted">Conta principal</span>' : `<button class="btn sm" data-reset="${u.id}" title="Gera uma senha nova e desconecta a pessoa">Nova senha</button> <button class="btn sm ${u.active ? 'bad' : ''}" data-user="${u.id}">${u.active ? 'Desativar' : 'Ativar'}</button>`}</td></tr>`).join('');
}
export async function load() { try { users = await api('/api/admin/users'); if (pw) pw = await api('/api/admin/passwords'); render(); } catch (e) { toast(e.message, true); } }
export function init() {
  $('#btnBackup').onclick = () => download('/api/backup', 'estoque_online.json').catch(e => toast(e.message, true));
  $('#ubody').onclick = async e => {
    const r = e.target.closest('[data-reset]');
    if (r) { target = users.find(x => x.id === r.dataset.reset); $('#spName').textContent = target.name || target.email; $('#formSetPw').reset(); $('#spOk').textContent = 'Gerar senha'; $('#dSetPw').showModal(); $('#spPass').focus(); return; }
    const b = e.target.closest('[data-user]'); if (!b) return; const u = users.find(x => x.id === b.dataset.user); b.disabled = true;
    try { await api(`/api/admin/users/${u.id}/active`, { json: { active: !u.active } }); toast('Acesso atualizado'); load(); } catch (err) { toast(err.message, true); b.disabled = false; }
  };
  $('#formUser').onsubmit = async e => {
    e.preventDefault(); const b = e.submitter; b.disabled = true; $('#cred').classList.add('hidden');
    try {
      const d = await api('/api/admin/users', { json: { name: $('#uName').value.trim(), email: $('#uEmail').value.trim() } });
      showCred('Conta criada', d); e.target.reset(); load();
    } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
  };
  $('#credCopy').onclick = async () => {
    try { await navigator.clipboard.writeText($('#credPass').textContent); toast('Senha copiada'); }
    catch { getSelection().selectAllChildren($('#credPass')); toast('Selecionei a senha: use Ctrl+C para copiar.'); }
  };
  $('#spPass').oninput = () => $('#spOk').textContent = $('#spPass').value ? 'Salvar esta senha' : 'Gerar senha';
  $('#formSetPw').onsubmit = async e => {
    e.preventDefault(); const b = $('#spOk'); b.disabled = true;
    try { const d = await api(`/api/admin/users/${target.id}/password`, { json: { password: $('#spPass').value.trim() } }); $('#dSetPw').close(); showCred('Nova senha', d); toast('Senha trocada'); load(); }
    catch (err) { toast(err.message, true); } finally { b.disabled = false; }
  };
  $('#btnResetAll').onclick = async () => {
    if (!await confirmBox('Gerar senha nova para todos?', 'Todas as contas, menos a sua de administrador, recebem uma senha nova e são desconectadas. As senhas ficam visíveis só para você na coluna Senha.', 'Gerar para todos')) return;
    const b = $('#btnResetAll'); b.disabled = true;
    try {
      all = (await api('/api/admin/users/reset-all', { json: {} })).results;
      $('#credAllBody').innerHTML = all.map(x => `<tr><td><b>${esc(x.name || x.email)}</b><small class="muted">${esc(x.email)}</small></td><td>${x.ok ? `<code>${esc(x.password)}</code>` : `<span class="pill bad">${esc(x.error)}</span>`}</td></tr>`).join('') || '<tr><td class="muted">Nenhuma outra conta.</td></tr>';
      $('#credAll').classList.remove('hidden'); $('#credAll').scrollIntoView({ block: 'nearest' }); toast('Senhas novas geradas'); load();
    } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
  };
  $('#credAllCopy').onclick = async () => {
    const text = all.filter(x => x.ok).map(x => `${x.name || x.email} (${x.email}): ${x.password}`).join('\n');
    try { await navigator.clipboard.writeText(text); toast('Senhas copiadas'); } catch { getSelection().selectAllChildren($('#credAllBody')); toast('Selecionei as senhas: use Ctrl+C para copiar.'); }
  };
  $('#credAllOk').onclick = () => { $('#credAllBody').innerHTML = ''; all = []; $('#credAll').classList.add('hidden'); };
  $('#btnShowPw').onclick = async () => {
    const b = $('#btnShowPw');
    if (pw) { pw = null; b.textContent = 'Mostrar'; return render(); }
    b.disabled = true;
    try { pw = await api('/api/admin/passwords'); b.textContent = 'Esconder'; render(); } catch (e) { toast(e.message, true); } finally { b.disabled = false; }
  };
  $('#credOk').onclick = () => { $('#credPass').textContent = ''; $('#cred').classList.add('hidden'); };
}
