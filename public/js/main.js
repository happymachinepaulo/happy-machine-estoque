import { $, $$ } from './core.js';
import { start, signOut } from './auth.js';
import { state, setData, cached } from './state.js';
import * as estoque from './estoque.js';
import * as revisar from './revisar.js';
import * as consertos from './consertos.js';
import * as historico from './historico.js';
import * as admin from './admin.js';

const views = { estoque: null, fotos: revisar.load, consertos: consertos.load, historico: historico.load, admin: admin.load };
const titles = { estoque: 'Estoque', fotos: 'Fotos', consertos: 'Consertos', historico: 'Histórico', admin: 'Admin' };
let inited = false;

function show() {
  let v = location.hash.slice(1); if (!(v in views) || (v === 'admin' && state.me?.role !== 'admin')) v = 'estoque';
  $$('main > section').forEach(s => s.hidden = s.id !== 'v-' + v);
  $$('.nav').forEach(b => b.removeAttribute('aria-current'));
  $$('.nav').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); });
  document.title = `${titles[v]} · Happy Machine`;
  views[v]?.();
}

async function ready() {
  if (!inited) {
    inited = true;
    estoque.init(); revisar.init(); consertos.init(); historico.init(); admin.init();
    $$('.nav').forEach(b => b.onclick = () => { location.hash = b.dataset.view; });
    $('#logout').onclick = $('#logout2').onclick = signOut;
    addEventListener('hashchange', show);
  }
  const c = cached(); if (c && !state.products.length) setData(c);
  $('#whoName').textContent = state.me?.name || state.me?.email || '';
  $('#navAdmin').classList.toggle('hidden', state.me?.role !== 'admin');
  show();
  await estoque.reload(false);
  $('#whoName').textContent = state.me?.name || state.me?.email || '';
  $('#navAdmin').classList.toggle('hidden', state.me?.role !== 'admin');
  if (location.hash === '#admin' && state.me?.role !== 'admin') location.hash = 'estoque';
}
start(ready);
