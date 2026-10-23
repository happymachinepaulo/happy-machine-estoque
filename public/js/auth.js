import { $, api, setSession, clearSession, hasSession, onLock } from './core.js';

let challenge = null;
const say = (t, err = false) => { $('#authMsg').textContent = t; $('#authMsg').classList.toggle('error', err); };
const step = s => { $('#stepLogin').hidden = s !== 'login'; $('#stepCode').hidden = s !== 'code'; };
async function post(path, body) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Não foi possível entrar.'); return d;
}
export function lock(msg = '') { document.body.dataset.auth = 'locked'; step('login'); challenge = null; $('#password').value = ''; say(msg, !!msg); document.querySelectorAll('dialog[open]').forEach(d => d.close()); }
export async function signOut() { try { await api('/api/auth/logout', { method: 'POST' }); } catch {} clearSession(); location.hash = ''; location.reload(); }

export function start(onReady) {
  onLock(m => lock(m));
  const busy = (form, fn) => async e => {
    e.preventDefault(); const b = form.querySelector('[type=submit]'); b.disabled = true; say('');
    try { await fn(); } catch (err) { say(err.message, true); } finally { b.disabled = false; }
  };
  $('#formLogin').onsubmit = busy($('#formLogin'), async () => {
    const email = $('#email').value.trim();
    try { challenge = (await post('/api/auth/login', { email, password: $('#password').value })).challenge; } finally { $('#password').value = ''; }
    $('#codeHelp').textContent = `Enviamos um código para ${email}. Confira também o spam.`; $('#formCode').reset(); step('code'); $('#code').focus();
  });
  $('#formCode').onsubmit = busy($('#formCode'), async () => {
    setSession(await post('/api/auth/verify', { challenge, code: $('#code').value.trim() }));
    document.body.dataset.auth = 'ready'; await onReady();
  });
  $('#codeBack').onclick = () => { step('login'); say(''); };
  if (hasSession()) { document.body.dataset.auth = 'ready'; onReady().catch(() => {}); } else lock();
}
