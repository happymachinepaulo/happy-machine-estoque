/* Recursos gerais: configurações da conta, busca rápida (Ctrl K), central de alertas e lista de reposição. */
import { $, $$, esc, fold, n, icon, api, toast, open, download, clearSession, initials, personColor, prefs, applyPrefs } from './core.js';
import { state, subscribe, activeHolders } from './state.js';
import { openDetail } from './estoque.js';
import * as pessoas from './pessoas.js';

const isPending = p => p.review_status === 'pendente';
const isLow = p => !isPending(p) && p.min_quantity > 0 && p.quantity <= p.min_quantity;
const unit = p => p?.unit === 'm' ? 'm' : p?.unit === 'lote' ? 'lote(s)' : 'un';
const busy = (form, fn) => async e => {
  e.preventDefault(); const b = e.submitter || form.querySelector('[type=submit]'); b.disabled = true;
  try { await fn(); } catch (err) { toast(err.message, true); } finally { b.disabled = false; }
};

/* ── configurações ── */
export function who() {
  const me = state.me || {}, name = me.name || me.email || '';
  $('#cfgAvatar').textContent = initials(name); $('#cfgName').textContent = name; $('#cfgEmail').textContent = me.email || '';
  $('#cfgRole').textContent = me.role === 'admin' ? 'Administrador' : 'Operador'; $('#cfgRole').className = 'pill ' + (me.role === 'admin' ? 'cadastro' : 'blue');
  if (document.activeElement !== $('#cfgNameIn')) $('#cfgNameIn').value = me.name || '';
  const admin = me.role === 'admin';
  $('#btnDelete').disabled = admin;
  $('#delInfo').textContent = admin ? 'A conta do administrador principal não pode ser excluída. Para sair da equipe, passe a administração para outra pessoa primeiro.' : 'Você vai precisar da sua senha. Depois disso, só um administrador consegue criar um novo acesso para você.';
}
export function loadConfig() {
  who();
  $('#prefHome').value = prefs.get('home', 'painel');
  let list = false; try { list = localStorage.getItem('hm-list') === '1'; } catch {}
  $('#prefView').value = list ? 'list' : 'grid';
  $('#prefSplash').checked = prefs.get('splash', true); $('#prefCalm').checked = prefs.get('calm', false); $('#prefBig').checked = prefs.get('big', false);
}
function strength(pw) {
  let s = 0; if (pw.length >= 10) s++; if (pw.length >= 14) s++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++;
  const ok = pw.length >= 10 && /[A-Za-z]/.test(pw) && /\d/.test(pw);
  return { s: ok ? s : Math.min(s, 1), ok };
}
function initConfig() {
  $('#formName').onsubmit = busy($('#formName'), async () => {
    const r = await api('/api/account/profile', { json: { name: $('#cfgNameIn').value.trim() } });
    state.me = { ...state.me, name: r.name }; $('#whoName').textContent = r.name; $('#whoAvatar').textContent = initials(r.name); who(); toast('Nome atualizado');
  });
  $('#pwNew').addEventListener('input', () => {
    const { s, ok } = strength($('#pwNew').value), L = ['muito fraca', 'fraca', 'razoável', 'boa', 'forte', 'muito forte'];
    $('#pwMeter').style.width = ($('#pwNew').value ? Math.max(12, s / 5 * 100) : 0) + '%';
    $('#pwMeter').style.background = !ok ? 'var(--red-l)' : s >= 4 ? 'var(--capri)' : 'var(--orange)';
    $('#pwHint').textContent = $('#pwNew').value ? `Senha ${L[s]}${ok ? '' : ': use 10 ou mais caracteres, com letras e números'}.` : 'Use 10 ou mais caracteres, misturando letras e números.';
  });
  $('#formPass').onsubmit = busy($('#formPass'), async () => {
    if ($('#pwNew').value !== $('#pwNew2').value) { $('#pwNew2').focus(); throw new Error('As duas senhas novas não são iguais.'); }
    if (!strength($('#pwNew').value).ok) throw new Error('A nova senha precisa ter 10 ou mais caracteres, com letras e números.');
    await api('/api/account/password', { json: { password: $('#pwOld').value, new_password: $('#pwNew').value } });
    $('#formPass').reset(); $('#pwMeter').style.width = '0'; toast('Senha alterada. Use a nova no próximo login.');
  });
  $('#btnOthers').onclick = async () => {
    try { await api('/api/account/logout-others', { json: {} }); toast('Pronto. Os outros aparelhos foram desconectados.'); } catch (e) { toast(e.message, true); }
  };
  $('#prefHome').onchange = e => { prefs.set('home', e.target.value); toast('Tela inicial salva'); };
  $('#prefView').onchange = e => { $(e.target.value === 'list' ? '#vList' : '#vGrid').click(); toast('Preferência salva'); };
  $('#prefSplash').onchange = e => prefs.set('splash', e.target.checked);
  $('#prefCalm').onchange = e => { prefs.set('calm', e.target.checked); applyPrefs(); };
  $('#prefBig').onchange = e => { prefs.set('big', e.target.checked); applyPrefs(); };
  $('#cfgCsv').onclick = () => download('/api/export.csv', 'estoque.csv').catch(e => toast(e.message, true));
  $('#btnDelete').onclick = () => { $('#formDelete').reset(); open($('#dDelete')); $('#delPw').focus(); };
  $('#formDelete').onsubmit = busy($('#formDelete'), async () => {
    if ($('#delWord').value.trim().toUpperCase() !== 'EXCLUIR') { $('#delWord').focus(); throw new Error('Digite EXCLUIR para confirmar.'); }
    await api('/api/account/delete', { json: { password: $('#delPw').value, confirm: 'EXCLUIR' } });
    clearSession(); location.hash = ''; location.reload();
  });
}

/* ── busca rápida ── */
const PAGES = [['painel', 'Painel', 'pulse'], ['estoque', 'Estoque', 'box'], ['galpao', 'Galpão (foto do estoque)', 'map'], ['pessoas', 'Pessoas', 'users'], ['fotos', 'Revisar fotos', 'photo'], ['consertos', 'Consertos', 'wrench'], ['manutencao', 'Manutenção das máquinas', 'gear'], ['historico', 'Histórico', 'clock'], ['config', 'Configurações', 'sliders']];
let qsSel = 0;
function qsRender() {
  const q = fold($('#qsInput').value.trim());
  const prods = (q ? state.products.filter(p => p._s.includes(q) || String(p.id) === q) : [...state.products].sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))).slice(0, 8);
  const people = activeHolders().filter(h => !q || fold(h.name).includes(q)).slice(0, 4);
  const pages = PAGES.filter(([k, l]) => (k !== 'galpao' || state.me?.role === 'admin') && (!q || fold(l).includes(q))).slice(0, q ? 4 : 0);
  const sec = (t, items) => items.length ? `<p class="qsSec">${t}</p>${items.join('')}` : '';
  const html = sec(q ? 'Peças' : 'Peças recentes', prods.map(p => `<button class="qsItem" data-pid="${p.id}" role="option"><span class="th">${p.photo ? `<img src="${esc(p.photo)}" alt="">` : icon('box')}</span><span class="tx"><b>${esc(p.name)}</b><small>${esc(p.category || 'Sem categoria')} · #${p.id}${p.location && state.me?.role === 'admin' ? ` · Estante ${esc(p.location)}` : ''}${p._out ? ` · ${n(p._out)} com pessoas` : ''}</small></span><em class="${isLow(p) ? 'low' : ''}">${isPending(p) && !p.quantity ? '?' : n(p.quantity)} ${unit(p)}</em></button>`))
    + sec('Pessoas', people.map(h => `<button class="qsItem" data-holder="${h.id}" role="option"><span class="th av" style="background:${personColor(h.id)}">${esc(initials(h.name))}</span><span class="tx"><b>${esc(h.name)}</b><small>${h.items.length} tipos de peça · ${n(h.items.reduce((a, i) => a + i.quantity, 0))} unidades</small></span></button>`))
    + sec('Ir para', pages.map(([k, l, ic]) => `<button class="qsItem" data-go="${k}" role="option"><span class="th">${icon(ic)}</span><span class="tx"><b>${l}</b></span></button>`));
  $('#qsList').innerHTML = html || `<p class="qsNone">Nada encontrado para “${esc($('#qsInput').value)}”.</p>`;
  qsSel = 0; qsMark();
}
function qsMark() { $$('#qsList .qsItem').forEach((b, i) => b.setAttribute('aria-selected', i === qsSel)); $$('#qsList .qsItem')[qsSel]?.scrollIntoView({ block: 'nearest' }); }
function qsPick(b) {
  if (!b) return; $('#dSearch').close();
  if (b.dataset.pid) openDetail(+b.dataset.pid);
  else if (b.dataset.holder) { pessoas.select(b.dataset.holder); location.hash = 'pessoas'; dispatchEvent(new HashChangeEvent('hashchange')); }
  else location.hash = b.dataset.go;
}
export function openSearch() { $('#qsInput').value = ''; qsRender(); open($('#dSearch')); $('#qsInput').focus(); }
function initSearch() {
  $('#openSearch').onclick = openSearch;
  $('#qsInput').addEventListener('input', qsRender);
  $('#qsInput').addEventListener('keydown', e => {
    const items = $$('#qsList .qsItem');
    if (e.key === 'ArrowDown') { e.preventDefault(); qsSel = Math.min(items.length - 1, qsSel + 1); qsMark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); qsSel = Math.max(0, qsSel - 1); qsMark(); }
    else if (e.key === 'Enter') { e.preventDefault(); qsPick(items[qsSel]); }
    else if (e.key === 'Escape') { e.preventDefault(); $('#dSearch').close(); }
  });
  $('#qsList').onclick = e => qsPick(e.target.closest('.qsItem'));
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && document.body.dataset.auth === 'ready') { e.preventDefault(); $('#dSearch').open ? $('#dSearch').close() : openSearch(); }
  });
}

/* ── alertas ── */
let repairs = null;
function alertItems() {
  const low = state.products.filter(isLow), zero = low.filter(p => p.quantity === 0), check = state.products.filter(isPending);
  const out = [];
  if (zero.length) out.push({ c: 'var(--red-l)', ic: 'box', t: `${n(zero.length)} ${zero.length === 1 ? 'peça zerada' : 'peças zeradas'}`, s: zero.slice(0, 3).map(p => p.name).join(', '), act: 'restock' });
  if (low.length > zero.length) out.push({ c: 'var(--orange)', ic: 'cart', t: `${n(low.length - zero.length)} ${low.length - zero.length === 1 ? 'peça abaixo' : 'peças abaixo'} do mínimo`, s: low.filter(p => p.quantity).slice(0, 3).map(p => p.name).join(', '), act: 'restock' });
  if (state.pending) out.push({ c: 'var(--pink)', ic: 'photo', t: `${n(state.pending)} ${state.pending === 1 ? 'foto' : 'fotos'} para revisar`, s: 'Vincule as fotos às peças certas.', act: 'fotos' });
  if (check.length) out.push({ c: 'var(--rosa)', ic: 'check', t: `${n(check.length)} ${check.length === 1 ? 'peça' : 'peças'} a conferir`, s: 'Confira nome e quantidade para entrar no total.', act: 'conferir' });
  const waiting = (repairs || []).filter(r => r.status === 'aguardando');
  if (waiting.length) out.push({ c: 'var(--blue-l)', ic: 'wrench', t: `${n(waiting.length)} ${waiting.length === 1 ? 'conserto aguardando' : 'consertos aguardando'}`, s: waiting.slice(0, 3).map(r => r.name).join(', '), act: 'consertos' });
  return out;
}
function badge() {
  const k = alertItems().length, b = $('#alertCount');
  b.textContent = k; b.classList.toggle('hidden', !k);
}
async function openAlerts() {
  const draw = () => {
    const items = alertItems();
    $('#alSub').textContent = items.length ? 'O que precisa da sua atenção' : 'Tudo em dia por aqui';
    $('#alList').innerHTML = items.length ? items.map((a, i) => `<button class="alItem" data-act="${a.act}" style="--c:${a.c};--k:${i}"><span class="ic">${icon(a.ic)}</span><span class="tx"><b>${esc(a.t)}</b><small>${esc(a.s)}</small></span>${icon('send')}</button>`).join('')
      : `<div class="empty" style="padding:30px 10px"><span class="ill" style="background:rgba(110,242,255,.13);color:var(--capri)">${icon('check')}</span><b>Nada pendente</b><span>Sem peças em falta, fotos ou consertos esperando.</span></div>`;
  };
  draw(); open($('#dAlerts'));
  if (!repairs) { try { repairs = await api('/api/repairs'); draw(); badge(); } catch {} }
}
function initAlerts() {
  subscribe(badge);
  $('#openAlerts').onclick = openAlerts;
  $('#alList').onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return; $('#dAlerts').close();
    const a = b.dataset.act;
    if (a === 'restock') return openRestock();
    if (a === 'conferir') { location.hash = 'estoque'; setTimeout(() => $('#estSub .sub[data-key=conferir]')?.click(), 80); return; }
    location.hash = a;
  };
  document.addEventListener('stock:changed', () => { repairs = null; });
}

/* ── lista de reposição ── */
let rs = [];
function openRestock() {
  rs = state.products.filter(isLow).sort((a, b) => a.quantity / a.min_quantity - b.quantity / b.min_quantity).map(p => ({ p, buy: Math.max(1, p.min_quantity * 2 - p.quantity) }));
  $('#rsSub').textContent = rs.length ? `${rs.length} ${rs.length === 1 ? 'peça' : 'peças'} abaixo do mínimo · ${new Date().toLocaleDateString('pt-BR')}` : 'Nenhuma peça abaixo do mínimo';
  $('#rsList').innerHTML = rs.length ? `<div class="rsHead"><span>Peça</span><span>Tem</span><span>Mín.</span><span>Comprar</span></div>` + rs.map(({ p, buy }, i) => `<div class="rsRow" style="--k:${Math.min(i, 12)}"><span class="nm"><b>${esc(p.name)}</b><small>${esc(p.category || 'Sem categoria')} · #${p.id}</small></span><span class="${p.quantity ? '' : 'z'}">${n(p.quantity)}</span><span>${n(p.min_quantity)}</span><input type="number" min="0" step="1" value="${buy}" data-i="${i}" aria-label="Comprar ${esc(p.name)}" inputmode="numeric"></div>`).join('')
    : `<div class="empty" style="padding:30px 10px"><span class="ill" style="background:rgba(110,242,255,.13);color:var(--capri)">${icon('check')}</span><b>Estoque em dia</b><span>Defina o estoque mínimo nas peças para elas aparecerem aqui quando acabarem.</span></div>`;
  $$('#dRestock .da button').forEach(b => b.disabled = !rs.length);
  open($('#dRestock'));
}
const rsText = () => `*Lista de reposição · Happy Machine*\n${new Date().toLocaleDateString('pt-BR')}\n\n` + rs.filter(x => x.buy > 0).map(({ p, buy }) => `• ${p.name}: comprar ${n(buy)} ${unit(p)} (tem ${n(p.quantity)}, mínimo ${n(p.min_quantity)})`).join('\n');
function initRestock() {
  document.addEventListener('click', e => { if (e.target.closest('[data-restock]')) { e.preventDefault(); e.stopPropagation(); openRestock(); } }, true);
  $('#rsList').addEventListener('input', e => { const i = e.target.dataset.i; if (i !== undefined) rs[+i].buy = Math.max(0, +e.target.value || 0); });
  $('#rsCopy').onclick = async () => { try { await navigator.clipboard.writeText(rsText()); toast('Lista copiada'); } catch { toast('Não foi possível copiar. Use Imprimir ou WhatsApp.', true); } };
  $('#rsWhats').onclick = () => window.open('https://wa.me/?text=' + encodeURIComponent(rsText()), '_blank', 'noopener');
  $('#rsPrint').onclick = () => { document.body.classList.add('printing'); setTimeout(() => { print(); document.body.classList.remove('printing'); }, 50); };
}

export function init() { initConfig(); initSearch(); initAlerts(); initRestock(); badge(); }
