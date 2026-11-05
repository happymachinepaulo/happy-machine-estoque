/* Logs (só o administrador vê): quem entrou, com qual conta, de qual aparelho e de onde,
   tentativas que deram errado e as alterações importantes no estoque e nas contas. */
import { $, esc, fold, n, icon, api, toast, subtabs, fmtDate } from './core.js';

let data = null, tab = 'acessos', busy = false;
const EV = {
  entrou: ['Entrou', 'ok'], abriu: ['Abriu o site', 'blue'], saiu: ['Saiu', 'cadastro'], senha_ok: ['Senha certa, código enviado', 'blue'],
  senha_errada: ['Senha errada', 'bad'], codigo_errado: ['Código errado', 'bad'], bloqueado: ['Bloqueado (muitas tentativas)', 'bad'], sem_acesso: ['Conta desativada tentou entrar', 'bad'],
  senha_alterada: ['Trocou a senha', 'warn'], saiu_outros: ['Saiu dos outros aparelhos', 'warn'], conta_excluida: ['Excluiu a conta', 'bad'],
};
const ACT = {
  create: 'Cadastrou peça', update: 'Editou peça', delete: 'Excluiu peça', movement: 'Movimentou estoque', confirm: 'Confirmou quantidade', location: 'Mudou de estante',
  review_photo: 'Revisou foto', attach_photo: 'Adicionou foto', holder_create: 'Cadastrou pessoa', holder_update: 'Editou pessoa', holder_consume: 'Baixa de pessoa',
  change_password: 'Trocou a senha', logout_others: 'Saiu dos outros aparelhos', delete_account: 'Excluiu a conta', create_user: 'Criou usuário', user_active: 'Ativou/desativou usuário',
};
const ACCOUNT = new Set(['change_password', 'logout_others', 'delete_account', 'create_user', 'user_active']);
const FIELDS = { name: 'nome', quantity: 'qtd', amount: 'qtd', kind: 'tipo', destination: 'para', location: 'estante', category: 'categoria', min_quantity: 'mínimo', status: 'status', email: 'e-mail', active: 'ativo', note: 'obs' };

const users = () => new Map((data?.users || []).map(u => [u.id, u]));
const who = (id, email) => { const u = id && users().get(id); return u ? (u.name || u.email) : (email || 'Desconhecido'); };
const day = 864e5, ago = ms => Date.now() - ms;
const since = s => {
  const d = (Date.now() - new Date(s)) / 1e3;
  if (d < 60) return 'agora'; if (d < 3600) return `há ${Math.floor(d / 60)} min`; if (d < 86400) return `há ${Math.floor(d / 3600)} h`;
  return d < 7 * 86400 ? `há ${Math.floor(d / 86400)} d` : fmtDate(s);
};
function detail(a) {
  if (a.action === 'location') return `${a.before_data || 'sem estante'} → ${a.after_data || 'sem estante'}`;
  let o; try { o = JSON.parse(a.after_data); } catch { return a.after_data || ''; }
  if (!o || typeof o !== 'object') return String(o ?? '');
  if (a.action === 'user_active' || a.action === 'create_user') { const u = users().get(o.id); return `${u ? (u.name || u.email) : (o.email || '')}${'active' in o ? (o.active ? ' · ativado' : ' · desativado') : ''}`; }
  const KIND = { entrada: 'entrada', saida: 'saída', ajuste: 'ajuste', consumo: 'baixa', cadastro: 'cadastro' };
  return Object.entries(FIELDS).filter(([k]) => o[k] !== undefined && o[k] !== '').slice(0, 4).map(([k, l]) => `${l}: ${k === 'kind' ? KIND[o[k]] || o[k] : o[k]}`).join(' · ');
}

function stats() {
  const acc = data.access, today = new Date(); today.setHours(0, 0, 0, 0);
  const good = acc.filter(a => a.ok && (a.event === 'entrou' || a.event === 'abriu'));
  const week = good.filter(a => new Date(a.created_at) > ago(7 * day));
  const tiles = [
    ['Acessos hoje', good.filter(a => new Date(a.created_at) >= today).length, 'pulse', 'var(--capri)'],
    ['Pessoas na semana', new Set(week.map(a => a.user_id || a.email)).size, 'users', 'var(--blue-l)'],
    ['Aparelhos na semana', new Set(week.map(a => (a.user_id || a.email) + a.device)).size, 'devices', 'var(--yellow)'],
    ['Erros de login (24 h)', acc.filter(a => !a.ok && new Date(a.created_at) > ago(day)).length, 'shield', 'var(--red)'],
  ];
  $('#logStats').innerHTML = tiles.map(([l, v, ic, c], i) => `<div class="stat" style="--c:${c};--i:${i}"><i>${icon(ic)}</i><span>${l}</span><b>${n(v)}</b></div>`).join('');
}

/* uma linha por conta, com os aparelhos que ela usou */
function people() {
  const by = new Map();
  for (const a of data.access) {
    if (!a.ok || !['entrou', 'abriu', 'senha_ok'].includes(a.event)) continue;
    const k = a.user_id || a.email; if (!by.has(k)) by.set(k, { id: a.user_id, email: a.email, last: a.created_at, devs: new Map() });
    const p = by.get(k), dk = a.device + '|' + (a.ip || ''); const d = p.devs.get(dk);
    if (d) d.count++; else p.devs.set(dk, { device: a.device, ua: a.user_agent, ip: a.ip, place: a.place, last: a.created_at, count: 1 });
  }
  const list = [...by.values()];
  $('#logPeople').innerHTML = list.length ? list.map((p, i) => {
    const fresh = Date.now() - new Date(p.last) < 15 * 6e4;
    return `<article class="lgP" style="--i:${i}"><header><span class="lgAv${fresh ? ' live' : ''}">${esc(who(p.id, p.email).slice(0, 1).toUpperCase())}</span><div><b>${esc(who(p.id, p.email))}</b><small>${esc(p.email)}</small></div><em title="${esc(fmtDate(p.last))}">${fresh ? 'online agora' : since(p.last)}</em></header>
      <ul>${[...p.devs.values()].slice(0, 6).map(d => `<li title="${esc(d.ua)}"><span class="ic">${icon(/iPhone|Android|iPad/.test(d.device) ? 'devices' : 'grid')}</span><span class="tx"><b>${esc(d.device)}</b><small>${esc([d.place, d.ip].filter(Boolean).join(' · ') || 'local desconhecido')}</small></span><span class="when">${since(d.last)}<small>${n(d.count)}×</small></span></li>`).join('')}</ul></article>`;
  }).join('') : '<p class="muted">Ninguém entrou desde que os logs foram ligados.</p>';
}

function rows() {
  const q = fold($('#logQ').value.trim()), U = users();
  let head, body;
  if (tab === 'acessos' || tab === 'erros') {
    const list = data.access.filter(a => (tab === 'erros' ? !a.ok : a.ok)).filter(a => !q || fold(`${who(a.user_id, a.email)} ${a.email} ${a.device} ${a.ip} ${a.place} ${a.user_agent} ${EV[a.event]?.[0] || a.event}`).includes(q));
    head = '<th>Quando</th><th>Conta</th><th>O que houve</th><th>Aparelho</th><th>De onde</th>';
    body = list.slice(0, 400).map(a => { const [l, c] = EV[a.event] || [a.event, '']; return `<tr><td><b>${esc(since(a.created_at))}</b><small class="muted">${esc(fmtDate(a.created_at))}</small></td>
      <td><b>${esc(who(a.user_id, a.email))}</b><small class="muted">${esc(a.email)}</small></td><td><span class="pill ${c}">${l}</span>${a.detail ? `<small class="muted">${esc(a.detail)}</small>` : ''}</td>
      <td title="${esc(a.user_agent)}">${esc(a.device || '—')}</td><td>${esc(a.place || '—')}<small class="muted mono">${esc(a.ip || '')}</small></td></tr>`; }).join('');
  } else {
    const list = data.audit.filter(a => !String(a.action).startsWith('migration_')).filter(a => tab === 'contas' ? ACCOUNT.has(a.action) : !ACCOUNT.has(a.action))
      .filter(a => !q || fold(`${who(a.actor_id)} ${a.product_name} ${ACT[a.action] || a.action} ${detail(a)}`).includes(q));
    head = '<th>Quando</th><th>Quem</th><th>O que fez</th><th>Peça</th><th>Detalhe</th>';
    body = list.slice(0, 400).map(a => `<tr><td><b>${esc(since(a.created_at))}</b><small class="muted">${esc(fmtDate(a.created_at))}</small></td>
      <td><b>${esc(a.actor_id ? (U.get(a.actor_id)?.name || U.get(a.actor_id)?.email || 'Conta removida') : 'Sistema')}</b></td>
      <td><span class="pill ${a.action === 'delete' || a.action === 'delete_account' ? 'bad' : a.action === 'create' ? 'cadastro' : 'blue'}">${esc(ACT[a.action] || a.action)}</span></td>
      <td>${a.product_id ? `${esc(a.product_name || 'Peça removida')} <small class="muted">#${a.product_id}</small>` : '—'}</td><td class="lgDet">${esc(detail(a)) || '—'}</td></tr>`).join('');
  }
  $('#logHead').innerHTML = `<tr>${head}</tr>`;
  $('#logBody').innerHTML = body || '<tr><td colspan="5" class="muted" style="text-align:center;padding:28px">Nada por aqui.</td></tr>';
}

function tabs() {
  const errs = data ? data.access.filter(a => !a.ok).length : undefined;
  subtabs($('#logSub'), [{ key: 'acessos', label: 'Acessos', icon: 'devices', accent: 'var(--capri)' }, { key: 'erros', label: 'Erros de login', icon: 'shield', accent: 'var(--red)', count: errs },
    { key: 'estoque', label: 'Alterações no estoque', icon: 'box', accent: 'var(--yellow)' }, { key: 'contas', label: 'Contas e senhas', icon: 'key', accent: 'var(--rosa)' }], tab, k => { tab = k; tabs(); rows(); });
}

export async function load() {
  if (busy) return; busy = true; $('#logRefresh').disabled = true;
  try {
    data = await api('/api/admin/logs');
    $('#logWarn').classList.toggle('hidden', data.ready);
    stats(); people(); tabs(); rows();
  } catch (e) { toast(e.message, true); } finally { busy = false; $('#logRefresh').disabled = false; }
}
export function init() {
  $('#logQ').oninput = () => data && rows();
  $('#logRefresh').onclick = load;
}
