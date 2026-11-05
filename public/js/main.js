import { $, $$, slide, initials, debounce, prefs } from './core.js';
import { start, signOut } from './auth.js';
import { state, setData, cached } from './state.js';
import * as estoque from './estoque.js';
import * as pessoas from './pessoas.js';
import * as painel from './painel.js';
import * as revisar from './revisar.js';
import * as consertos from './consertos.js';
import * as historico from './historico.js';
import * as admin from './admin.js';
import * as move from './move.js';
import * as tools from './tools.js';
import * as galpao from './galpao.js';
import * as logs from './logs.js';

const views = { painel: painel.load, estoque: null, galpao: galpao.load, pessoas: pessoas.load, fotos: revisar.load, consertos: consertos.load, manutencao: null, historico: historico.load, admin: admin.load, logs: logs.load, config: tools.loadConfig };
const order = Object.keys(views);
const titles = { painel: 'Painel', estoque: 'Estoque', galpao: 'Galpão', pessoas: 'Pessoas', fotos: 'Fotos', consertos: 'Consertos', manutencao: 'Manutenção Máquinas', historico: 'Histórico', admin: 'Admin', logs: 'Logs', config: 'Configurações' };
let inited = false, currentView = null;
/* abas só da conta administradora (o Galpão ainda é provisório) */
const ADMIN_ONLY = ['admin', 'logs', 'galpao'];

function moveInk() {
  const tabs = $('#tabs'), act = tabs.querySelector('[aria-current=page]'), ink = tabs.querySelector('.tabInk');
  if (!act) return;
  const cs = getComputedStyle(act), c = cs.getPropertyValue('--ink-c').trim() || cs.getPropertyValue('--c').trim() || 'var(--red)';
  ink.style.background = c; ink.style.setProperty('--glow', c);
  if (getComputedStyle(tabs).flexDirection === 'column') {   // barra lateral: desliza na vertical
    ink.style.width = '100%'; ink.style.height = act.offsetHeight + 'px'; ink.style.transform = `translateY(${act.offsetTop}px)`;
    return;
  }
  ink.style.height = act.offsetHeight + 'px'; slide(tabs, ink, act);
  const l = act.offsetLeft, r = l + act.offsetWidth;
  if (l < tabs.scrollLeft || r > tabs.scrollLeft + tabs.clientWidth) tabs.scrollTo({ left: l - 24, behavior: 'smooth' });
}

function show() {
  let v = location.hash.slice(1); if (!v) v = prefs.get('home', 'painel'); if (!(v in views) || (ADMIN_ONLY.includes(v) && state.me?.role !== 'admin')) v = 'painel';
  const back = currentView && order.indexOf(v) < order.indexOf(currentView);
  $$('main > section').forEach(s => {
    const on = s.id === 'v-' + v;
    if (on && s.hidden) { s.classList.toggle('fromLeft', !!back); s.style.animation = 'none'; s.offsetWidth; s.style.animation = ''; }
    s.hidden = !on;
  });
  $$('.tab').forEach(b => b.dataset.view === v ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  document.title = `${titles[v]} · Happy Machine`;
  if (currentView !== v) scrollTo({ top: 0 });
  currentView = v;
  requestAnimationFrame(moveInk);
  views[v]?.();
  if (v === 'estoque') estoque.render();
}

function who() {
  const name = state.me?.name || state.me?.email || '';
  $('#whoName').textContent = name; $('#whoAvatar').textContent = initials(name); tools.who();
  $('#navAdmin').classList.toggle('hidden', state.me?.role !== 'admin');
  $('#navLogs').classList.toggle('hidden', state.me?.role !== 'admin');
  $('#navGalpao').classList.toggle('hidden', state.me?.role !== 'admin');
  document.documentElement.classList.toggle('isAdmin', state.me?.role === 'admin');
}

async function ready() {
  if (!inited) {
    inited = true;
    move.init({ reload: estoque.reload });
    estoque.init(); painel.init(); pessoas.init(); revisar.init(); consertos.init(); historico.init(); admin.init(); logs.init(); tools.init();
    $$('.tab').forEach(b => b.onclick = () => { location.hash = b.dataset.view; });
    $('#logout').onclick = signOut;
    addEventListener('hashchange', show);
    addEventListener('resize', debounce(moveInk, 80));
    document.fonts?.ready.then(moveInk);
  }
  const c = cached(); if (c && !state.products.length) setData(c);
  splash();
  who(); show();
  await estoque.reload(false);
  who(); moveInk();
  if (ADMIN_ONLY.includes(location.hash.slice(1)) && state.me?.role !== 'admin') location.hash = 'estoque';
  else if (ADMIN_ONLY.includes(location.hash.slice(1)) && currentView !== location.hash.slice(1)) show();   // a conta só fica conhecida depois do carregamento
}
/* abertura: HAPPY acende letra por letra como neon (uma vez por sessão) */
function splash() {
  if (!prefs.get('splash', true) || document.documentElement.classList.contains('calm')) return;
  try { if (sessionStorage.getItem('hm-splash')) return; sessionStorage.setItem('hm-splash', '1'); } catch {}
  const d = document.createElement('div'); d.className = 'splash'; d.setAttribute('aria-hidden', 'true');
  d.innerHTML = `<div><div class="word">${[...'HAPPY'].map((l, i) => `<span style="--i:${i}">${l}</span>`).join('')}</div><small>MACHINE</small></div>`;
  document.body.append(d); setTimeout(() => d.remove(), 2400);
}
start(ready);
