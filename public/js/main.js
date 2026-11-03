import { $, $$, slide, initials, debounce } from './core.js';
import { start, signOut } from './auth.js';
import { state, setData, cached } from './state.js';
import * as estoque from './estoque.js';
import * as pessoas from './pessoas.js';
import * as revisar from './revisar.js';
import * as consertos from './consertos.js';
import * as historico from './historico.js';
import * as admin from './admin.js';
import * as move from './move.js';

const views = { estoque: null, pessoas: pessoas.load, fotos: revisar.load, consertos: consertos.load, manutencao: null, historico: historico.load, admin: admin.load };
const order = Object.keys(views);
const titles = { estoque: 'Estoque', pessoas: 'Pessoas', fotos: 'Fotos', consertos: 'Consertos', manutencao: 'Manutenção Máquinas', historico: 'Histórico', admin: 'Admin' };
let inited = false, currentView = null;

function moveInk() {
  const tabs = $('#tabs'), act = tabs.querySelector('[aria-current=page]'), ink = tabs.querySelector('.tabInk');
  if (!act) return;
  ink.style.background = getComputedStyle(act).getPropertyValue('--c').trim() || 'var(--ink)';
  slide(tabs, ink, act);
  const l = act.offsetLeft, r = l + act.offsetWidth;
  if (l < tabs.scrollLeft || r > tabs.scrollLeft + tabs.clientWidth) tabs.scrollTo({ left: l - 24, behavior: 'smooth' });
}

function show() {
  let v = location.hash.slice(1); if (!(v in views) || (v === 'admin' && state.me?.role !== 'admin')) v = 'estoque';
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
  $('#whoName').textContent = name; $('#whoAvatar').textContent = initials(name);
  $('#navAdmin').classList.toggle('hidden', state.me?.role !== 'admin');
}

async function ready() {
  if (!inited) {
    inited = true;
    move.init({ reload: estoque.reload });
    estoque.init(); pessoas.init(); revisar.init(); consertos.init(); historico.init(); admin.init();
    $$('.tab').forEach(b => b.onclick = () => { location.hash = b.dataset.view; });
    $('#logout').onclick = signOut;
    addEventListener('hashchange', show);
    addEventListener('resize', debounce(moveInk, 80));
    addEventListener('scroll', () => $('.top').classList.toggle('scrolled', scrollY > 4), { passive: true });
    document.fonts?.ready.then(moveInk);
  }
  const c = cached(); if (c && !state.products.length) setData(c);
  who(); show();
  await estoque.reload(false);
  who(); moveInk();
  if (location.hash === '#admin' && state.me?.role !== 'admin') location.hash = 'estoque';
}
start(ready);
