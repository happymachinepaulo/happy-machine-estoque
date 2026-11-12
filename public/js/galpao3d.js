/* Galpão em 3D: a sala do estoque montada a partir das fotos (planta em shelves.js).
   Desenha paredes, piso, a porta dupla, luzes do teto, os móveis (UNITS: estantes pretas de tela, alvenaria, cestos), a pilha
   embrulhada, os fliperamas, as escadas e o ar-condicionado; cuida da câmera (girar, aproximar, voar até a estante),
   do destaque de cada letra (ZONES: o móvel inteiro ou só a faixa de prateleiras dela), das etiquetas e da rota da porta
   até a estante. A interface em volta fica em galpao.js. */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { SHELVES, UNITS, ZONES, ROOM, PROPS } from './shelves.js';
import { Products, fillProducts } from './galpao3dProdutos.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const FACE = { n: V(0, 0, -1), s: V(0, 0, 1), e: V(1, 0, 0), w: V(-1, 0, 0) };
const calm = () => document.documentElement.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches;
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
const pick = (r, a) => a[Math.floor(r() * a.length)];

let R = null;   // tudo da cena montada: { renderer, scene, camera, controls, ... }

/* ── texturas desenhadas na hora (nada para baixar) ── */
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function textures() {
  const mesh = canvasTex(64, 64, (g, w) => { g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, w, w); g.strokeStyle = '#5a5a62'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, w); g.stroke(); g.beginPath(); g.moveTo(0, i * 16); g.lineTo(w, i * 16); g.stroke(); } });
  const grid = canvasTex(128, 128, (g, w) => { g.clearRect(0, 0, w, w); g.strokeStyle = '#fff'; g.lineWidth = 5; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, w); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } });
  const card = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#efe6d8'; g.fillRect(0, 0, w, w);
    const r = rng(7); for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${120 + r() * 60},${90 + r() * 40},${50 + r() * 30},${r() * .08})`; g.fillRect(r() * w, r() * w, 1 + r() * 8, 1); }
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(0, w * .44, w, w * .12);                 // fita
    g.fillStyle = 'rgba(40,30,20,.35)'; g.fillRect(w * .1, w * .7, w * .32, 6); g.fillRect(w * .1, w * .76, w * .22, 6);   // escrita da caixa
  }, false);
  const floor = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#7b7e83'; g.fillRect(0, 0, w, w);
    const r = rng(3); for (let i = 0; i < 9000; i++) { const v = 120 + r() * 50; g.fillStyle = `rgba(${v},${v + 2},${v + 5},${r() * .18})`; g.fillRect(r() * w, r() * w, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(60,62,66,${r() * .06})`; g.beginPath(); g.arc(r() * w, r() * w, 20 + r() * 70, 0, 7); g.fill(); }
  });
  floor.repeat.set(3, 3);
  const bubbles = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#f4f4f6'; g.fillRect(0, 0, w, h);
    const r = rng(11), cs = ['#ff5aa0', '#ffd23f', '#3fc1ff', '#7ce36b', '#b86bff', '#ff8a3d', '#ff4d6a', '#4be0d0'];
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, rad = 8 + r() * 34, col = pick(r, cs);
      const gr = g.createRadialGradient(x - rad * .35, y - rad * .35, rad * .1, x, y, rad); gr.addColorStop(0, '#fff'); gr.addColorStop(.35, col); gr.addColorStop(1, col);
      g.fillStyle = gr; g.globalAlpha = .9; g.beginPath(); g.arc(x, y, rad, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
  }, false);
  const label = txt => canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#121214'; g.fillRect(0, 0, w, h); g.fillStyle = '#f2f2f2'; g.font = '700 82px "Comic Sans MS", "Segoe Print", cursive'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, w / 2, h / 2 + 4); }, false);
  const route = canvasTex(128, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(110,242,255,0)'); gr.addColorStop(.5, 'rgba(110,242,255,.55)'); gr.addColorStop(1, 'rgba(110,242,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(235,255,255,.95)'; g.beginPath(); g.moveTo(40, 18); g.lineTo(70, 32); g.lineTo(40, 46); g.lineTo(50, 32); g.closePath(); g.fill();   // seta
  });
  const ring = canvasTex(256, 256, (g, w) => {
    const c = w / 2; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c * .78, 0, 7); g.stroke();
    const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, 7); g.fill();
  }, false);
  const wrap = canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#c8a476'; g.fillRect(0, 0, w, h);
    const bands = [[0, .2, '#d5b48a'], [.2, .4, '#2c3548'], [.4, .58, '#d2b088'], [.58, .8, '#283043'], [.8, 1, '#cfac82']];
    bands.forEach(([a, b, c]) => { g.fillStyle = c; g.fillRect(0, a * h, w, (b - a) * h); });
    const r = rng(5); g.strokeStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 60; i++) { g.lineWidth = .5 + r() * 2; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * .3, y + r() * 30 - 15, w * .7, y + r() * 30 - 15, w, y + r() * 20 - 10); g.stroke(); }
    g.fillStyle = '#f2e600'; g.fillRect(w * .55, h * .06, w * .2, h * .07); g.fillRect(w * .62, h * .5, w * .16, h * .06);
  }, false);
  const panel = canvasTex(64, 64, (g, w) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, w); g.strokeStyle = '#cfd3d8'; g.lineWidth = 6; g.strokeRect(0, 0, w, w); }, false);
  const stars = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#d3d6da'; g.fillRect(0, 0, w, h); g.fillStyle = '#2c2f34';
    const star = (cx, cy, R) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * .42 : R; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); };
    star(w * .5, h * .3, 26); star(w * .28, h * .58, 14); star(w * .72, h * .62, 14); star(w * .5, h * .84, 10);
  }, false);
  return { mesh, grid, card, floor, bubbles, label, route, ring, wrap, panel, stars };
}

/* ── materiais ── */
function materials(T) {
  const M = {
    floor: new THREE.MeshStandardMaterial({ map: T.floor, roughness: .82, metalness: 0 }),
    wall: new THREE.MeshStandardMaterial({ color: '#d9d8d4', roughness: .92 }),
    ceil: new THREE.MeshStandardMaterial({ color: '#d9d9d7', roughness: 1 }),
    steel: new THREE.MeshStandardMaterial({ color: '#17171a', roughness: .45, metalness: .65 }),
    deck: new THREE.MeshStandardMaterial({ color: '#3a3a40', map: T.mesh, roughness: .55, metalness: .55, side: THREE.DoubleSide }),
    back: new THREE.MeshStandardMaterial({ color: '#1b1b1e', map: T.grid, alphaMap: T.grid, alphaTest: .45, roughness: .5, metalness: .6, side: THREE.DoubleSide }),
    masonry: new THREE.MeshStandardMaterial({ color: '#f1f0ec', roughness: .88 }),
    card: new THREE.MeshStandardMaterial({ map: T.card, roughness: .9 }),
    plain: new THREE.MeshStandardMaterial({ roughness: .55, metalness: .05 }),
    metal: new THREE.MeshStandardMaterial({ roughness: .35, metalness: .85 }),
    light: new THREE.MeshBasicMaterial({ map: T.panel, color: '#ffffff' }),
    alu: new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: .3, metalness: .9 }),
    white: new THREE.MeshStandardMaterial({ color: '#f4f4f4', roughness: .4 }),
    black: new THREE.MeshStandardMaterial({ color: '#141416', roughness: .5 }),
    film: new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: .16, roughness: .08, metalness: .1, depthWrite: false }),
    wrap: new THREE.MeshStandardMaterial({ map: T.wrap, roughness: .35, metalness: .05 }),
    arcade: new THREE.MeshStandardMaterial({ map: T.bubbles, roughness: .35 }),
    arcadeSide: new THREE.MeshStandardMaterial({ color: '#d7d9dc', roughness: .3, metalness: .7 }),
    arcadeEnd: new THREE.MeshStandardMaterial({ map: T.stars, roughness: .32, metalness: .5 }),
  };
  return M;
}

/* ── coleta de caixas para virar InstancedMesh (milhares de itens sem pesar) ── */
class Batch {
  constructor() { this.items = { card: [], plain: [], metal: [] }; }
  add(kind, x, y, z, sx, sy, sz, color, rotY = 0) { this.items[kind].push({ x, y, z, sx, sy, sz, color, rotY }); }
  build(M, parent) {
    const geo = new THREE.BoxGeometry(1, 1, 1), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color();
    for (const [k, list] of Object.entries(this.items)) {
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, M[k], list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(V(0, 1, 0), it.rotY);
        m4.compose(V(it.x, it.y + it.sy / 2, it.z), q, V(it.sx, it.sy, it.sz)); im.setMatrixAt(i, m4);
        im.setColorAt(i, c.set(it.color));
      });
      im.castShadow = true; im.receiveShadow = true; parent.add(im);
    }
  }
}

/* sistema de eixos de um móvel ou de uma faixa: comprimento (run), profundidade (para a frente) */
function frame(s) {
  const cx = s.x + s.w / 2, cz = s.z + s.d / 2, alongX = s.w >= s.d;
  const run = alongX ? V(1, 0, 0) : V(0, 0, 1), len = alongX ? s.w : s.d, dep = alongX ? s.d : s.w;
  const front = FACE[s.face] || V(0, 0, 1);
  const at = (r, f, y) => V(cx + run.x * r + front.x * f, y, cz + run.z * r + front.z * f);
  const rot = alongX ? 0 : Math.PI / 2;
  return { cx, cz, run, front, len, dep, at, rot };
}

const CARD = ['#c49a6c', '#b88d5f', '#d0a878', '#bf9466', '#caa273'];
let PRODS = null;   // produtos das prateleiras (galpao3dProdutos.js)

/* móvel preto de metal com prateleiras de tela. "tela" tem fundo de tela (e laterais, se sides); "aberta" só tem
   prateleiras embaixo e a moldura vazia em cima */
function metalUnit(u, M, r, g) {
  const f = frame(u), h = u.h, open = u.kind === 'aberta', bays = u.bays || Math.max(1, Math.round(f.len / 1.05)), bay = f.len / bays;
  const post = new THREE.BoxGeometry(.03, h, .03);
  for (let i = 0; i <= bays; i++) for (const side of [-1, 1]) {
    const m = new THREE.Mesh(post, M.steel), p = f.at(-f.len / 2 + i * bay, side * (f.dep / 2 - .015), h / 2); m.position.copy(p); m.castShadow = true; g.add(m);
  }
  const grid = (geo, a, b) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * a / .26, uv.getY(i) * b / .26); return geo; };
  const rails = y => { for (const side of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(f.len, .035, .02), M.steel); rail.rotation.y = f.rot; rail.position.copy(f.at(0, side * (f.dep / 2 - .01), y)); g.add(rail); } };
  (open ? u.lv : [...u.lv, h]).forEach(y => {
    const deck = grid(new THREE.PlaneGeometry(f.len, f.dep), f.len, f.dep); deck.rotateX(-Math.PI / 2); if (f.rot) deck.rotateY(f.rot);
    const dm = new THREE.Mesh(deck, M.deck); dm.position.set(f.cx, y, f.cz); dm.receiveShadow = true; dm.castShadow = true; g.add(dm);
    rails(y);
  });
  const tela = (len, hh, a, fw, y, ry) => { const m = new THREE.Mesh(grid(new THREE.PlaneGeometry(len, hh), len, hh), M.back); m.rotation.y = f.rot + ry; m.position.copy(f.at(a, fw, y)); g.add(m); };
  if (open) {                                // moldura de cima, sem prateleira
    rails(h - .018);
    for (const e of [-1, 1]) { const er = new THREE.Mesh(new THREE.BoxGeometry(.02, .035, f.dep), M.steel); er.rotation.y = f.rot; er.position.copy(f.at(e * (f.len / 2 - .01), 0, h - .018)); g.add(er); }
    tela(f.len, 1, 0, -f.dep / 2 + .01, .55, 0);
  }
  if (u.kind === 'tela') tela(f.len, h - .1, 0, -f.dep / 2 + .01, h / 2 + .03, 0);
  if (u.sides) for (const e of [-1, 1]) tela(f.dep, h - .1, e * (f.len / 2 - .012), 0, h / 2 + .03, Math.PI / 2);
  fillProducts(u, f, u.lv, r, PRODS, open ? u.lv[u.lv.length - 1] + .4 : h);
}

/* caixa preta com o número escrito na frente (017, 023, 001, 004), igual às das fotos */
function labelBin(g, T, M, txt, p, w, hh, face) {
  const alongX = face === 's' || face === 'n', mats = Array(6).fill(M.black);
  mats[{ s: 4, n: 5, e: 0, w: 1 }[face]] = new THREE.MeshStandardMaterial({ map: T.label(txt), roughness: .5 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(alongX ? w : .38, hh, alongX ? .38 : w), mats); m.position.set(p.x, p.y + hh / 2, p.z); m.castShadow = true; g.add(m);
}

/* estante de alvenaria branca do fundo: duas colunas de quatro vãos. Na direita, as telas em pé embaixo, o caixote vermelho
   e a caixa 017, as caixas grandes e as impressoras; na esquerda, as caixas laranja, a caixa 023; em cima, os painéis brancos */
function masonry(u, M, B, r, g, T) {
  const f = frame(u), h = u.h, ys = [.08, .5, .98, 1.46], half = f.len / 2;
  const add = (geo, p) => { const m = new THREE.Mesh(geo, M.masonry); m.position.copy(p); m.rotation.y = f.rot; m.castShadow = m.receiveShadow = true; g.add(m); };
  add(new THREE.BoxGeometry(f.len, .08, f.dep), f.at(0, 0, .04));
  [.5, .98, 1.46, h].forEach(y => add(new THREE.BoxGeometry(f.len, .05, f.dep), f.at(0, 0, y - .025)));
  [-half + .05, 0, half - .05].forEach((a, i) => add(new THREE.BoxGeometry(i === 1 ? .08 : .1, h, f.dep), f.at(a, 0, h / 2)));
  const put = (kind, a, y, sr, sy, sd, color, yaw = 0, fw = 0) => { const p = f.at(a, fw, y); B.add(kind, p.x, p.y, p.z, sr, sy, sd, color, f.rot + yaw); };
  const boxes = (a0, a1, y, maxH = .34, minW = .26, addW = .14) => { let a = a0; while (a < a1 - minW) { const w = Math.min(minW + r() * addW, a1 - a), hh = Math.min(maxH, .2 + r() * .16); put('card', a + w / 2, y, w, hh, .34, pick(r, CARD), (r() - .5) * .08, (r() - .5) * .04); if (hh < .2 && r() < .5) put('card', a + w / 2, y + hh, w * .9, .13, .3, pick(r, CARD), (r() - .5) * .1); a += w + .02 + r() * .04; } };
  const screens = (a0, a1) => { for (let a = a0; a < a1; a += .036 + r() * .012) put('plain', a, ys[0], .026, .3 + r() * .07, .3, r() < .2 ? '#3a3a3e' : '#121214', (r() - .5) * .1, (r() - .5) * .05); };
  const W0 = -half + .12, W1 = -.07, E0 = .07, E1 = half - .12;
  // embaixo: telas pretas em pé e, no canto esquerdo, caixas
  screens(E0 + .02, E1 - .02); screens(-.95, W1 - .02); boxes(W0, -1, ys[0]);
  // 2º vão: caixas laranja e caixa preta com placas (esquerda); caixote vermelho e a 017 (direita)
  for (let k = 0; k < 2; k++) { put('plain', W0 + .28, ys[1] + k * .17, .52, .16, .36, '#df7a2c', (r() - .5) * .06); put('plain', W0 + .84, ys[1] + k * .17, .5, .16, .36, '#e2842f', (r() - .5) * .06); }
  put('plain', W0 + 1.42, ys[1], .46, .28, .36, '#161618'); put('plain', W0 + 1.42, ys[1] + .28, .4, .02, .3, '#2f6b45');
  put('card', E0 + .2, ys[1], .3, .24, .32, CARD[1]);
  put('plain', E0 + .66, ys[1], .5, .3, .36, '#c42a2a'); put('plain', E0 + .66, ys[1] + .3, .44, .015, .3, '#2a2a2e');
  labelBin(g, T, M, '017', f.at(E0 + 1.24, .03, ys[1]), .56, .36, u.face);
  boxes(E0 + 1.56, E1, ys[1]);
  // 3º vão: caixas de papelão (as grandes ficam na direita)
  boxes(W0, W1, ys[2]); boxes(E0, E1, ys[2], .34, .34, .04);
  // 4º vão: a 023 na esquerda; caixinhas, cesto branco, impressoras e pote na direita
  put('plain', W0 + .2, ys[3], .3, .2, .3, '#ececec'); labelBin(g, T, M, '023', f.at(W0 + .82, .03, ys[3]), .6, .36, u.face); boxes(W0 + 1.2, W1, ys[3]);
  for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) put('card', E0 + .22 + i * .34, ys[3] + k * .17, .32, .16, .32, pick(r, CARD));
  put('plain', E0 + .92, ys[3], .3, .2, .28, '#efefef'); put('plain', E0 + 1.28, ys[3], .3, .22, .3, '#1c1c1f', .1); put('plain', E0 + 1.62, ys[3], .28, .2, .3, '#2c2c30', -.08); put('plain', E0 + 1.6, ys[3] + .2, .2, .14, .2, '#1c1c1f');
  // em cima: painéis brancos de LED em pé e uma caixa preta
  const panels = (a0, a1) => { for (let a = a0; a < a1; a += .2 + r() * .08) { const m = new THREE.Mesh(new THREE.BoxGeometry(.02, .4, .3), M.white); m.position.copy(f.at(a, -.03, h + .2)); m.rotation.y = f.rot + Math.PI / 2; m.rotation.z = (r() - .5) * .5; m.castShadow = true; g.add(m); } };
  panels(W0 + .05, W1); panels(E0 + .05, E0 + .85); panels(E0 + 1.45, E1);
  put('plain', E0 + 1.15, h, .5, .26, .36, '#1b1b1d');
}

/* cestos pretos empilháveis, abertos na frente, cheios de cabos; o monte escalonado (step) recua um pouco a cada cesto */
function baskets(u, B, r) {
  const f = frame(u), cw = f.len / u.cols, bh = u.h / u.rows, wd = cw - .03, dp = f.dep - .02, t = .012, dark = '#1b1b1e';
  const cab = ['#2050c8', '#c42a2a', '#111113', '#e8e8e8', '#2a8f4a', '#f2d21b', '#ff7a1a', '#111113', '#c42a2a'];
  const put = (a, fw, y, sr, sy, sd, color, yaw = 0) => { const p = f.at(a, fw, y); B.add('plain', p.x, p.y, p.z, sr, sy, sd, color, f.rot + yaw); };
  for (let c = 0; c < u.cols; c++) for (let k = 0; k < u.rows; k++) {
    const fw = u.step ? .09 - k * .05 : (r() - .5) * .02 + k * .006, a = -f.len / 2 + cw * (c + .5), y = k * bh;
    put(a, fw, y, wd, t, dp, dark); put(a, fw - dp / 2 + t / 2, y, wd, bh - .03, t, dark); put(a, fw + dp / 2 - t / 2, y, wd, bh * .4, t, dark);
    for (const e of [-1, 1]) put(a + e * (wd / 2 - t / 2), fw, y, t, bh - .03, dp, dark);
    for (let i = 0; i < 10; i++) put(a + (r() - .5) * (wd - .12), fw + (r() - .5) * (dp - .12), y + t + r() * bh * .34, .07 + r() * .12, .03 + r() * .04, .05 + r() * .08, pick(r, cab), r() * 3);
  }
}

/* o que fica em cima do tampo de cada móvel (como nas fotos) */
function roofItems(u, M, B, r, g, T) {
  const f = frame(u), y = u.h + .004;
  const put = (kind, a, sr, sy, sd, color, yaw = 0, up = 0, fw = 0) => { const p = f.at(a, fw, y + up); B.add(kind, p.x, p.y, p.z, sr, sy, sd, color, f.rot + yaw); };
  switch (u.roof) {
    case 'paineis':       // painéis grandes deitados, sobrando para a frente
      put('plain', 0, 1.25, .025, .62, '#f1f1f1', .05, 0, .06); put('plain', .04, 1.2, .025, .6, '#2b2b2e', -.04, .027, .1); put('plain', -.05, 1.22, .025, .58, '#f4f4f4', .02, .054, .12); break;
    case 'bandeja':       // bandeja preta comprida e espuma
      put('plain', .05, .9, .07, .3, '#1a1a1c', .03); put('plain', -.2, .45, .14, .3, '#f3f3ef', .1, .07); break;
    case 'caixaBaixa': put('card', -.1, .5, .14, .36, CARD[1], .08); break;
    case 'caixaJca':      // caixa de papelão da eletrônica e um saco
      put('card', .12, .52, .3, .38, CARD[0], -.06); put('plain', -.3, .26, .22, .3, '#8a5a3c', .3); break;
    case 'caixasEmPe':    // caixas desmontadas em pé
      for (let i = 0; i < 5; i++) put('card', -.5 + i * .1, .05, .42, .38, CARD[i % 5], (r() - .5) * .2); put('card', .3, .42, .1, .4, CARD[2], .1); break;
    case 'espuma':        // sacos de espuma branca
      put('plain', -.26, .4, .2, .42, '#f4f4f0', .1); put('plain', .2, .44, .18, .4, '#efefeb', -.08); put('plain', -.05, .42, .16, .38, '#f6f6f2', .2, .2); break;
    case 'paineisFita':   // painéis deitados e rolo de fita
      put('plain', 0, 1.05, .03, .5, '#e9d9d2', .03); put('plain', .08, .9, .025, .45, '#f2f0ec', -.05, .03); put('plain', -.3, .12, .05, .12, '#d9c59a', .4, .055); break;
    case 'potes':         // pote transparente, caixa 004 e plástico bolha
      put('plain', -.78, .5, .3, .36, '#dfe7ec'); labelBin(g, T, M, '004', f.at(-.12, 0, y), .52, .3, u.face); put('plain', .62, .4, .46, .3, '#f1f3f4', .2); put('plain', .95, .26, .3, .26, '#e9edef', -.3); break;
    case 'plastico':      // plástico bolha, capacete amarelo e caixas compridas
      put('plain', -.85, .5, .36, .34, '#eef0f1', .1); put('plain', -.3, .22, .2, .22, '#e8c41c', .3); put('card', .55, .7, .12, .3, CARD[2], .05); break;
    case 'impressoras':   // CPU preta, impressora branca e impressora preta
      put('plain', -.29, .18, .42, .4, '#121214'); put('plain', -.03, .3, .25, .36, '#f1f1f1'); put('plain', -.03, .24, .03, .3, '#d9d9d9', 0, .25); put('plain', .26, .3, .3, .38, '#2d2d31'); put('plain', .26, .3, .05, .34, '#b9bcc1', 0, .3); break;
  }
}

/* ── a sala ── */
function buildRoom(M, T, B, r, g) {
  const { w, l, h } = ROOM, t = .12;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, l), M.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(w / 2, 0, l / 2); fl.receiveShadow = true; g.add(fl);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * t, .14, l + 2 * t), new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: .9 })); slab.position.set(w / 2, -.071, l / 2); slab.receiveShadow = true; g.add(slab);
  const walls = [];
  const wall = (x0, z0, x1, z1, y0, y1, n) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(t, Math.abs(x1 - x0)), y1 - y0, Math.max(t, Math.abs(z1 - z0))), M.wall);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.receiveShadow = true; m.castShadow = true; m.userData = { n, y0, y1 }; g.add(m); walls.push(m); return m;
  };
  const d = ROOM.door, z0 = d.z, z1 = d.z + d.w, inW = V(1, 0, 0), dh = 2.1;
  wall(-t, -t / 2, w + t, -t / 2, 0, h, V(0, 0, 1));                 // fundo (alvenaria)
  wall(w + t / 2, 0, w + t / 2, l, 0, h, V(-1, 0, 0));               // direita (cestos)
  wall(-t, l + t / 2, w + t, l + t / 2, 0, h, V(0, 0, -1));          // parede do ar
  wall(-t / 2, 0, -t / 2, z0, 0, h, inW);                            // esquerda, com a porta dupla perto do canto
  wall(-t / 2, z1, -t / 2, l, 0, h, inW);
  wall(-t / 2, z0, -t / 2, z1, dh, h, inW);
  // porta dupla de metal: batente, soleira e as duas folhas abertas para fora
  const dm = new THREE.MeshStandardMaterial({ color: '#4a4d53', roughness: .38, metalness: .6 }), hm = new THREE.MeshStandardMaterial({ color: '#c9ccd1', roughness: .25, metalness: .9 });
  const lm = [dm.clone(), new THREE.MeshStandardMaterial({ color: '#3c3f44', roughness: .5, metalness: .5 }), hm.clone()];
  const bar = (sx, sy, sz, x, y, z) => { const j = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), dm); j.position.set(x, y, z); j.castShadow = true; g.add(j); };
  bar(t + .04, dh, .05, -t / 2, dh / 2, z0 + .025); bar(t + .04, dh, .05, -t / 2, dh / 2, z1 - .025); bar(t + .04, .05, d.w, -t / 2, dh + .025, (z0 + z1) / 2);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(t + .1, .012, d.w), hm); sill.position.set(-t / 2, .006, (z0 + z1) / 2); g.add(sill);
  const leaf = (hz, dir) => {
    const g2 = new THREE.Group(), lw = d.w / 2 - .06;
    const pl = new THREE.Mesh(new THREE.BoxGeometry(.045, 2.04, lw), lm[0]); pl.position.set(0, 1.02, dir * lw / 2); pl.castShadow = true; g2.add(pl);
    for (const y of [.55, 1.5]) for (const s of [-1, 1]) { const fr = new THREE.Mesh(new THREE.BoxGeometry(.008, .5, lw - .12), lm[1]); fr.position.set(s * .026, y, dir * lw / 2); g2.add(fr); }
    for (const s of [-1, 1]) { const hd = new THREE.Mesh(new THREE.BoxGeometry(.04, .22, .03), lm[2]); hd.position.set(s * .05, 1.05, dir * (lw - .07)); g2.add(hd); }
    g2.position.set(-t / 2, 0, hz); g2.rotation.y = -dir * 1.83; g.add(g2);
    g2.userData = { n: inW, leaf: lm, at: V(-t / 2, 0, hz) }; walls.push(g2);
  };
  leaf(z0 + .05, 1); leaf(z1 - .05, -1);
  // teto com as luzes quadradas de LED
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, l), M.ceil); ceil.rotation.x = Math.PI / 2; ceil.position.set(w / 2, h, l / 2); g.add(ceil);
  PROPS.luzes.forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.36, .36), M.light); p.rotation.x = Math.PI / 2; p.position.set(x, h - .01, z); g.add(p);
    const pl = new THREE.PointLight('#fff6ea', 2.7, 6, 1.4); pl.position.set(x, h - .05, z); g.add(pl);
  });
  return { walls, ceil };
}

function buildProps(M, T, B, r, g) {
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const { w, l } = ROOM;
  // pilha de caixas embrulhadas em filme (com as etiquetas amarelas), na ponta da fileira do meio
  const P = PROPS.pilha, px = P.x + P.w / 2, pz = P.z + P.d / 2;
  add(new THREE.BoxGeometry(P.w, P.h, P.d), M.wrap, px, P.h / 2, pz);
  add(new THREE.BoxGeometry(P.w + .03, P.h + .02, P.d + .03), M.film, px, P.h / 2 + .005, pz).castShadow = false;
  // uma das mesmas caixas no chão, encostada na pilha, com uma caixa de papelão em cima
  const N = PROPS.monte, nx = N.x + N.w / 2, nz = N.z + N.d / 2, wt = T.wrap.clone(); wt.repeat.set(1, .4); wt.offset.set(0, .6); wt.needsUpdate = true;
  add(new THREE.BoxGeometry(N.w, N.h, N.d), new THREE.MeshStandardMaterial({ map: wt, roughness: .35, metalness: .05 }), nx, N.h / 2, nz);
  add(new THREE.BoxGeometry(N.w + .03, N.h + .02, N.d + .03), M.film, nx, N.h / 2 + .005, nz).castShadow = false;
  B.add('card', nx - .04, N.h + .012, nz + .03, .52, .3, .34, '#c9a274', .15);
  // fliperamas em pé, lado a lado: tampo de bolhas coloridas, laterais prateadas com estrelas e bola branca do manche
  PROPS.fliperamas.forEach((F, i) => {
    const bt = T.bubbles.clone(); bt.repeat.set(.12, 1); bt.offset.set(.05 + i * .22, 0); bt.needsUpdate = true;
    const top = new THREE.MeshStandardMaterial({ map: bt, roughness: .35 }), cx = F.x + F.w / 2;
    add(new THREE.BoxGeometry(F.w, F.h, F.d), [M.arcadeSide, M.arcadeSide, top, M.arcadeSide, M.arcadeSide, M.arcadeEnd], cx, F.h / 2, F.z + F.d / 2);
    add(new THREE.CylinderGeometry(.008, .008, .07), M.steel, cx, F.h + .035, F.z + .2);
    add(new THREE.SphereGeometry(.04, 18, 12), M.white, cx, F.h + .09, F.z + .2);
    add(new THREE.CylinderGeometry(.022, .022, .012, 16), M.white, cx - .07, F.h + .006, F.z + .34);
  });
  { const F = PROPS.fliperamas[0], cloth = new THREE.MeshStandardMaterial({ color: '#0e0e10', roughness: .95 });      // pano preto jogado sobre o da ponta
    add(new THREE.BoxGeometry(.33, .025, .5), cloth, F.x + .15, F.h + .014, F.z + F.d - .3, .06); add(new THREE.BoxGeometry(.014, .26, .5), cloth, F.x - .01, F.h - .11, F.z + F.d - .3); }
  // escadas de alumínio encostadas na parede esquerda: a de degraus e a articulada
  const E = PROPS.escadas;
  [[0, 1.75, .2, .05], [.2, 1.9, .19, .07]].forEach(([dz, H, hw, tk], k) => {
    const lad = new THREE.Group(); lad.position.set(E.x + H * .11 + k * .1, 0, E.z + .2 + dz); lad.rotation.z = .11;
    for (const layer of k ? [0, .075] : [0]) {
      for (const s of [-hw, hw]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.028, H, tk), M.alu); rail.position.set(layer, H / 2, s); rail.castShadow = true; lad.add(rail); }
      for (let y = .26; y < H - .1; y += .28) { const st = new THREE.Mesh(new THREE.BoxGeometry(k ? .03 : .08, .028, hw * 2), M.alu); st.position.set(layer, y, 0); lad.add(st); }
    }
    if (k) for (const s of [-hw, hw]) for (const y of [.12, H - .1]) { const hg = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .03, 16), M.alu); hg.rotation.x = Math.PI / 2; hg.position.set(.037, y, s); lad.add(hg); }
    g.add(lad);
  });
  // cadeira preta
  const C = PROPS.cadeira, ch = new THREE.Group(); ch.position.set(C.x, 0, C.z); ch.rotation.y = -1.2;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.48, .08, .46), M.black); seat.position.y = .48; ch.add(seat);
  const bk = new THREE.Mesh(new THREE.BoxGeometry(.46, .55, .06), M.black); bk.position.set(0, .82, -.22); bk.rotation.x = -.12; ch.add(bk);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .4), M.steel); pole.position.y = .26; ch.add(pole);
  for (let i = 0; i < 5; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.3, .03, .04), M.steel); leg.rotation.y = i * Math.PI * 2 / 5; leg.position.set(Math.cos(i * 1.2566) * .15, .06, -Math.sin(i * 1.2566) * .15); ch.add(leg); }
  ch.traverse(o => { o.castShadow = true; }); g.add(ch);
  // ar-condicionado no alto da parede do ar; o cano isolado vai até o canto e sai pela parede dos cestos, e o dreno desce
  const A = PROPS.ar, grey = new THREE.MeshStandardMaterial({ color: '#9aa0a6' });
  add(new THREE.BoxGeometry(.95, .3, .22), M.white, A.x, A.y, l - .11);
  add(new THREE.BoxGeometry(.8, .02, .02), grey, A.x, A.y - .11, l - .225);
  add(new THREE.CylinderGeometry(.032, .032, w - .1 - (A.x + .47)), M.white, (A.x + .47 + w - .1) / 2, A.y - .2, l - .06).rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(.032, .032, 1.14), M.white, w - .06, A.y - .2, l - .06 - .57).rotation.x = Math.PI / 2;
  for (const [x, z] of [[A.x + .95, l - .05], [w - .05, l - .32], [w - .05, l - 1.14]]) add(new THREE.BoxGeometry(.06, .1, .06), grey, x, A.y - .2, z);
  add(new THREE.CylinderGeometry(.012, .012, A.y - .15), M.white, A.x + .52, (A.y - .15) / 2, l - .03);
  // no chão: a caixa perto da cadeira, as caixas de papelão empilhadas ao lado dos fliperamas (do lado da porta, sem ficar na
  // frente dela), o caixote vermelho com cabos azuis, um pote transparente e a caixa preta 001
  PROPS.soltas.forEach(([x, z]) => B.add('card', x, 0, z, .42 + r() * .1, .28 + r() * .08, .36, pick(r, CARD), r() * .4));
  { const K = PROPS.caixas, kx = K.x + K.w / 2;
    B.add('card', kx, 0, K.z + .19, K.w, .3, .36, CARD[0], .03); B.add('card', kx - .01, .3, K.z + .19, K.w - .04, .27, .34, CARD[2], -.05);
    B.add('card', kx - .01, 0, K.z + K.d - .19, K.w - .02, .28, .34, CARD[3], -.03); }
  PROPS.caixotes.forEach(([x, z]) => { B.add('plain', x, 0, z, .5, .3, .36, '#b8262b', .2); for (let i = 0; i < 4; i++) B.add('plain', x + (r() - .5) * .5, i < 2 ? .3 : 0, z + (r() - .5) * .3 - (i < 2 ? 0 : .32), .22, .05, .2, '#2a63d6', r() * 3); B.add('plain', x - .1, 0, z + .42, .44, .26, .32, '#dfe7ec', -.1); });
  labelBin(g, T, M, '001', V(PROPS.caixa001[0], 0, PROPS.caixa001[1]), .52, .3, 's');
}

/* ── rota: caminho mais curto na planta (grade de 10 cm) ── */
function obstacles() {
  const o = UNITS.map(s => [s.x, s.z, s.w, s.d]);
  for (const F of [PROPS.pilha, PROPS.monte, PROPS.escadas, PROPS.caixas, ...PROPS.fliperamas]) o.push([F.x, F.z, F.w, F.d]);
  return o;
}
function findPath(from, to) {
  const S = .1, W = Math.round(ROOM.w / S), L = Math.round(ROOM.l / S), pad = .15, block = new Uint8Array(W * L);
  for (const [x, z, w, d] of obstacles()) for (let i = Math.max(0, Math.floor((x - pad) / S)); i < Math.min(W, Math.ceil((x + w + pad) / S)); i++) for (let j = Math.max(0, Math.floor((z - pad) / S)); j < Math.min(L, Math.ceil((z + d + pad) / S)); j++) block[j * W + i] = 1;
  for (let i = 0; i < W; i++) for (let j = 0; j < L; j++) if (i < 2 || j < 2 || i >= W - 2 || j >= L - 2) block[j * W + i] = 1;
  const cell = p => [Math.min(W - 1, Math.max(0, Math.round(p.x / S))), Math.min(L - 1, Math.max(0, Math.round(p.z / S)))];
  const free = ([i, j]) => { if (!block[j * W + i]) return [i, j]; for (let k = 1; k < 12; k++) for (let a = -k; a <= k; a++) for (let b = -k; b <= k; b++) { const x = i + a, y = j + b; if (x >= 0 && y >= 0 && x < W && y < L && !block[y * W + x]) return [x, y]; } return [i, j]; };
  const [si, sj] = free(cell(from)), [ti, tj] = free(cell(to));
  const g = new Float32Array(W * L).fill(Infinity), prev = new Int32Array(W * L).fill(-1), open = [[0, si, sj]];
  g[sj * W + si] = 0;
  const N = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (open.length) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, i, j] = open.splice(bi, 1)[0];
    if (i === ti && j === tj) break;
    for (const [a, b, c] of N) {
      const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= W || y >= L || block[y * W + x]) continue;
      if (a && b && (block[j * W + x] || block[y * W + i])) continue;
      const ng = g[j * W + i] + c; if (ng < g[y * W + x]) { g[y * W + x] = ng; prev[y * W + x] = j * W + i; open.push([ng + Math.hypot(x - ti, y - tj), x, y]); }
    }
  }
  const pts = []; let k = tj * W + ti; if (prev[k] < 0 && k !== sj * W + si) return [from, to];
  while (k >= 0) { pts.push(V((k % W) * S, 0, Math.floor(k / W) * S)); k = prev[k]; }
  pts.reverse();
  // puxa a corda: mantém só as curvas
  const clear = (a, b) => { const n = Math.ceil(a.distanceTo(b) / .05); for (let q = 1; q < n; q++) { const p = a.clone().lerp(b, q / n), i = Math.round(p.x / S), j = Math.round(p.z / S); if (block[j * W + i]) return false; } return true; };
  const out = [pts[0]]; let a = 0;
  while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !clear(pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
  return [from.clone().setY(0), ...out, to.clone().setY(0)];
}
/* arredonda as quinas do caminho */
function smooth(pts) {
  const path = new THREE.CurvePath(); const rad = .35;
  let cur = pts[0].clone();
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i], next = pts[i + 1];
    if (!next) { path.add(new THREE.LineCurve3(cur, p.clone())); break; }
    const din = p.clone().sub(pts[i - 1]).normalize(), dout = next.clone().sub(p).normalize();
    const r = Math.min(rad, p.distanceTo(pts[i - 1]) / 2, next.distanceTo(p) / 2);
    const a = p.clone().addScaledVector(din, -r), b = p.clone().addScaledVector(dout, r);
    if (cur.distanceTo(a) > .001) path.add(new THREE.LineCurve3(cur, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p.clone(), b)); cur = b;
  }
  return path;
}
function ribbon(curve, width) {
  const n = Math.max(20, Math.ceil(curve.getLength() / .05)), pos = [], uv = [], idx = [], len = curve.getLength();
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), tg = curve.getTangentAt(t), side = V(-tg.z, 0, tg.x).normalize().multiplyScalar(width / 2);
    pos.push(p.x + side.x, .012, p.z + side.z, p.x - side.x, .012, p.z - side.z);
    uv.push(t * len / .32, 0, t * len / .32, 1);
    if (i < n) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ── destaque de uma letra: uma caixa por faixa (ZONES) ── */
function glowFor(z, c) {
  const g = new THREE.Group(), pad = .05, hh = z.y1 - z.y0 + (z.y0 ? 0 : pad), cy = z.y0 + hh / 2;
  const box = new THREE.BoxGeometry(z.w + pad * 2, hh, z.d + pad * 2);
  const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 1 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(z.w + .9, z.d + .9), new THREE.MeshBasicMaterial({ map: R.T.ring, color: c, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .015 - cy;
  g.add(fill, edges, floor); g.position.set(z.x + z.w / 2, cy, z.z + z.d / 2); g.visible = false; g.renderOrder = 5;
  g.userData = { fill, edges, floor };
  return g;
}
/* onde a etiqueta de uma letra fica presa: em cima do móvel, ou na frente da faixa quando a letra é só parte dele
   (as faixas do mesmo móvel ficam afastadas uma da outra para as etiquetas não se cobrirem) */
function anchorOf(z) {
  const f = frame(z);
  if (z.whole) return f.at(0, f.dep * .3, z.y1 + .16);
  return z.y1 < 2 ? f.at(f.len * (z.y0 ? .2 : .5), f.dep / 2 + .06, (z.y0 + z.y1) / 2 + .1) : f.at(f.len * -.22, f.dep * .3, z.y1 + .16);
}

/* ── montagem ── */
export function mount(el, hooks = {}) {
  unmount();
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  const small = Math.min(innerWidth, innerHeight) < 700;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, small ? 1.75 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .92;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el.append(renderer.domElement); renderer.domElement.className = 'g3Canvas';
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#0d0d10'); scene.fog = new THREE.Fog('#0d0d10', 18, 34);
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), .04).texture; scene.environmentIntensity = .35;
  const camera = new THREE.PerspectiveCamera(42, 1, .05, 80);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = .08; controls.maxPolarAngle = Math.PI * .47; controls.minDistance = 1.2; controls.maxDistance = 30;
  controls.screenSpacePanning = false; controls.zoomToCursor = true;
  const T = textures(), M = materials(T);
  R = { renderer, scene, camera, controls, el, T, M, hooks, glows: {}, anchors: {}, hits: [], state: {}, raf: 0, fly: null, route: null, walker: null, clock: new THREE.Clock(), alive: true };

  scene.add(new THREE.HemisphereLight('#f4f6ff', '#4a4741', .7));
  const sun = new THREE.DirectionalLight('#fff4e6', 1.6); sun.position.set(ROOM.w * .8, 9, ROOM.l * .2); sun.target.position.set(ROOM.w / 2, 0, ROOM.l / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);

  const world = new THREE.Group(); world.userData.T = T; scene.add(world);
  const B = new Batch(), r = rng(20261110); PRODS = new Products();
  R.room = buildRoom(M, T, B, r, world);
  buildProps(M, T, B, r, world);
  for (const u of UNITS) {
    const g = new THREE.Group(), ur = rng([...u.key].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) * 97); g.userData.T = T; world.add(g);
    if (u.kind === 'alvenaria') masonry(u, M, B, ur, g, T); else if (u.kind === 'cestos') baskets(u, B, ur); else metalUnit(u, M, ur, g);
    if (u.roof) roofItems(u, M, B, ur, g, T);
  }
  const hitGeo = new THREE.BoxGeometry(1, 1, 1), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const s of SHELVES) {
    const zs = ZONES[s.id] || [];
    R.glows[s.id] = zs.map(z => {
      const hit = new THREE.Mesh(hitGeo, hitMat), hh = z.y1 - z.y0; hit.scale.set(z.w + .08, hh, z.d + .02); hit.position.set(z.x + z.w / 2, z.y0 + hh / 2, z.z + z.d / 2); hit.userData.shelf = s.id; world.add(hit); R.hits.push(hit);
      const gl = glowFor(z, s.c); scene.add(gl); return gl;
    });
    if (zs[0]) R.anchors[s.id] = anchorOf(zs[0]);
  }
  B.build(M, world); PRODS.build(world); PRODS = null;

  // marca da entrada no chão
  const ent = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: T.ring, color: '#6EF2FF', transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false }));
  ent.rotation.x = -Math.PI / 2; ent.position.set(.5, .014, ROOM.door.z + ROOM.door.w / 2); scene.add(ent); R.entry = ent;

  // interação: arrastar gira, tocar escolhe a estante
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  const shelfAt = e => { const b = renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - b.left) / b.width * 2 - 1, -(e.clientY - b.top) / b.height * 2 + 1); ray.setFromCamera(ptr, camera); const h = ray.intersectObjects(R.hits, false)[0]; return h ? h.object.userData.shelf : null; };
  let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; cancelFly(); });
  renderer.domElement.addEventListener('pointerup', e => { if (!down) return; const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null; if (moved < 6) hooks.onPick?.(shelfAt(e)); });
  renderer.domElement.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' || down) return; const id = shelfAt(e); if (id !== R.state.hover) { R.state.hover = id; renderer.domElement.style.cursor = id ? 'pointer' : ''; refresh(); hooks.onHover?.(id); } });
  renderer.domElement.addEventListener('pointerleave', () => { if (R.state.hover) { R.state.hover = null; refresh(); hooks.onHover?.(null); } });
  controls.addEventListener('start', () => el.classList.add('moving'));
  controls.addEventListener('end', () => el.classList.remove('moving'));

  R.ro = new ResizeObserver(resize); R.ro.observe(el);
  resize(); overview(true);
  wake();
  return R;
}

export function unmount() {
  if (!R) return;
  R.alive = false; cancelAnimationFrame(R.raf); R.ro?.disconnect(); R.controls.dispose();
  R.scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { m.map?.dispose(); m.dispose(); }); });
  R.renderer.dispose(); R.renderer.domElement.remove(); R = null;
}

function resize() {
  if (!R) return;
  const w = R.el.clientWidth, h = R.el.clientHeight; if (!w || !h) return;
  R.renderer.setSize(w, h, false); R.camera.aspect = w / h; R.camera.updateProjectionMatrix();
}

/* ── laço de desenho: só roda com a aba visível ── */
export function wake() {
  if (!R || R.raf) return;
  R.clock.getDelta();
  const loop = () => {
    if (!R || !R.alive) return;
    if (!R.el.isConnected || R.el.offsetParent === null || document.hidden) { R.raf = 0; return; }
    R.raf = requestAnimationFrame(loop);
    const dt = Math.min(.05, R.clock.getDelta()), t = R.clock.elapsedTime;
    if (R.fly) stepFly();
    R.controls.update();
    walls();
    pulse(t);
    if (R.route) { R.route.tex.offset.x -= dt * 1.6; stepWalker(dt); }
    R.renderer.render(R.scene, R.camera);
    tags();
  };
  R.raf = requestAnimationFrame(loop);
}

/* paredes entre a câmera e a sala viram só um rodapé (casa de bonecas) e as folhas da porta ficam transparentes;
   o teto some visto de cima */
function walls() {
  const c = R.camera.position, cut = .32;
  for (const w of R.room.walls) {
    const u = w.userData, n = u.n, p = u.at || w.position, out = (c.x - p.x) * n.x + (c.z - p.z) * n.z < -.05;
    if (u.leaf) { const o = out ? .3 : 1; if (u.leaf[0].opacity !== o) for (const m of u.leaf) { m.opacity = o; m.transparent = o < 1; m.depthWrite = o === 1; m.needsUpdate = true; } continue; }
    if (u.y0 > 0) { w.visible = !out; continue; }
    const h = u.y1 - u.y0; w.scale.y = out ? cut / h : 1; w.position.y = out ? cut / 2 : (u.y0 + u.y1) / 2;
  }
  R.room.ceil.visible = c.y < ROOM.h - .05 && c.x > 0 && c.x < ROOM.w && c.z > 0 && c.z < ROOM.l;
}

function pulse(t) {
  const st = R.state, k = .5 + .5 * Math.sin(t * 4);
  for (const s of SHELVES) {
    const sel = st.sel === s.id, hov = st.hover === s.id, hit = st.hits?.has(s.id), low = st.mode === 'divergencia' && st.low?.[s.id];
    const on = sel || hov || hit || !!low, col = low && !sel ? '#ff3b55' : hit && !sel ? '#6EF2FF' : s.c;
    for (const g of R.glows[s.id]) {
      g.visible = on; if (!on) continue;
      const u = g.userData;
      u.edges.material.color.set(col); u.fill.material.color.set(col); u.floor.material.color.set(col);
      u.fill.material.opacity = sel ? .12 + .1 * k : hov ? .08 : .07 + .1 * k;
      u.edges.material.opacity = sel ? 1 : hov ? .7 : .55 + .45 * k;
      u.floor.material.opacity = sel ? .5 + .3 * k : .35;
    }
  }
  if (R.entry) R.entry.material.opacity = R.route ? .45 + .35 * k : .25;
  if (R.route?.target) { const s = 1 + .12 * k; R.route.target.scale.set(s, s, s); }
}

/* etiquetas HTML presas às estantes */
function tags() {
  const box = R.hooks.tagBox?.(); if (!box) return;
  const w = R.el.clientWidth, h = R.el.clientHeight, v = new THREE.Vector3();
  for (const b of box.children) {
    const a = R.anchors[b.dataset.shelf]; if (!a) continue;
    v.copy(a).project(R.camera);
    const on = v.z < 1 && v.x > -1.1 && v.x < 1.1 && v.y > -1.1 && v.y < 1.1;
    b.style.visibility = on ? '' : 'hidden';
    if (on) b.style.transform = `translate(${(v.x + 1) / 2 * w}px,${(1 - v.y) / 2 * h}px) translate(-50%,-100%)`;
  }
}

/* ── câmera ── */
function cancelFly() { if (R?.fly) { R.fly.done?.(); R.fly = null; } R && (R.controls.enabled = true); }
function flyTo(pos, target, ms = 1100) {
  return new Promise(res => {
    if (!R) return res();
    cancelFly();
    if (calm()) { R.camera.position.copy(pos); R.controls.target.copy(target); R.controls.update(); return res(); }
    R.fly = { p0: R.camera.position.clone(), t0: R.controls.target.clone(), p1: pos, t1: target, start: performance.now(), ms, done: res };
    R.controls.enabled = false; wake();
  });
}
function stepFly() {
  const f = R.fly, k = Math.min(1, (performance.now() - f.start) / f.ms), e = ease(k);
  R.camera.position.lerpVectors(f.p0, f.p1, e); R.camera.position.y += Math.sin(Math.PI * e) * .6;
  R.controls.target.lerpVectors(f.t0, f.t1, e);
  if (k >= 1) { const d = f.done; R.fly = null; R.controls.enabled = true; d?.(); }
}
export function overview(instant = false) {
  if (!R) return Promise.resolve();
  R.view = null;
  const portrait = R.el.clientHeight > R.el.clientWidth * 1.05, far = 1.08;
  const t = portrait ? V(ROOM.w / 2, 0, ROOM.l / 2 + .4) : V(ROOM.w / 2 + .05, .5, ROOM.l / 2 - .05);
  const asp = R.el.clientWidth / Math.max(1, R.el.clientHeight), dist = 5 / (Math.tan(THREE.MathUtils.degToRad(R.camera.fov / 2)) * Math.min(1, asp));
  // de fora da porta, olhando para dentro: a alvenaria no fundo e os cestos à direita, como na foto panorâmica
  const p = portrait ? t.clone().add(V(-.2, .86, .46).normalize().multiplyScalar(dist)) : V(ROOM.w / 2 - 5.6 * far, 7.6 * far, ROOM.l / 2 + 6.2 * far);
  if (instant) { R.camera.position.copy(p); R.controls.target.copy(t); R.controls.update(); return Promise.resolve(); }
  return flyTo(p, t, 1000);
}
/* quantos pontos da frente da faixa z ficam escondidos atrás de um móvel alto (ou da pilha), vistos de pos */
function hiddenFrom(pos, z) {
  const f = frame(z), P = PROPS.pilha;
  const tall = [...UNITS.filter(u => u.x !== z.x || u.z >= z.z + z.d || u.z + u.d <= z.z).map(u => [u.x, u.z, u.w, u.d, u.top || u.h + .3]), [P.x, P.z, P.w, P.d, P.h]];
  let n = 0;
  for (const a of [-.4, .4]) for (const b of [.25, .75]) {
    const q = f.at(a * f.len, f.dep / 2 + .03, z.y0 + b * (z.y1 - z.y0));
    for (let i = 1; i < 40; i++) { const p = pos.clone().lerp(q, i / 40); if (tall.some(([x, z0, w, d, h]) => p.y < h && p.x > x && p.x < x + w && p.z > z0 && p.z < z0 + d)) { n++; break; } }
  }
  return n;
}
/* Voa até a letra. Estante de metal encostada na parede esquerda ou direita é vista por trás, pela parede cortada, porque
   pela frente a fileira do meio tampa. Com a rota (path) a câmera fica do lado da frente, na diagonal e bem de cima, acima da
   fileira vizinha, para o caminho no corredor aparecer; vem do lado da porta, ou do outro se a pilha tampar. A alvenaria
   ocupa a parede inteira e é vista de frente. */
export function focus(id, path = false) {
  const s = ZONES[id]?.[0]; if (!R || !s) return Promise.resolve();
  const f = frame(s), portrait = R.el.clientHeight > R.el.clientWidth * 1.05, far = portrait ? 1.4 : 1, wide = !portrait && R.el.clientWidth > 760;
  const center = V(f.cx, s.whole ? 1.2 : (s.y0 + s.y1) / 2, f.cz), dist = Math.max(3.8, f.len * 1.6) * far;
  const back = !path && (s.kind === 'metal' || s.kind === 'tela') && (s.x < .01 || s.x + s.w > ROOM.w - .01);
  // o cartão fica à direita: a câmera mira um pouco para a direita e a estante aparece mais à esquerda
  // (no celular o cartão fica embaixo: a câmera mira mais para baixo e a estante aparece mais em cima)
  const view = pos => ({ pos, target: wide ? center.clone().add(center.clone().sub(pos).cross(V(0, 1, 0)).setY(0).normalize().multiplyScalar(pos.distanceTo(center) * .2)) : portrait ? center.clone().setY(center.y - pos.distanceTo(center) * .17) : center.clone() });
  const diag = side => view(center.clone().addScaledVector(f.front, f.dep / 2 + 1.5).addScaledVector(f.run, 3 * far * side).setY(center.y + 3.6 * far));
  let v;
  if (s.kind === 'alvenaria') v = view(center.clone().addScaledVector(f.front, 3.3 * far).addScaledVector(f.run, -.9).setY(5.6 * far));
  else if (back) v = view(center.clone().addScaledVector(f.front, -dist * .9).addScaledVector(f.run, f.len * .35 + .6).setY(center.y + 1.5 + dist * .42));
  else { v = diag(1); const n = hiddenFrom(v.pos, s); if (n) { const o = diag(-1); if (hiddenFrom(o.pos, s) < n) v = o; } }
  R.view = { id, back };
  return flyTo(v.pos, v.target, 1150);
}

/* ── estado vindo da interface ── */
export function update(st) { if (!R) return; Object.assign(R.state, st); refresh(); }
function refresh() { if (R && !R.raf) wake(); }

/* rota da porta até a frente da estante, com um pontinho andando por ela */
export function route(id) {
  clearRoute();
  const s = SHELVES.find(x => x.id === id), zone = ZONES[id]?.[0]; if (!R || !s || !zone) return null;
  const f = frame(zone), goal = V(f.cx, 0, f.cz).addScaledVector(f.front, f.dep / 2 + .45);
  const start = V(.35, 0, ROOM.door.z + ROOM.door.w / 2);
  const curve = smooth(findPath(start, goal)), len = curve.getLength();
  const tex = R.T.route.clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping;
  const g = new THREE.Group();
  const rib = ribbon(curve, .42), seen = { map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#9ff8ff' };
  g.add(new THREE.Mesh(rib, new THREE.MeshBasicMaterial(seen)));
  const ghost = new THREE.Mesh(rib, new THREE.MeshBasicMaterial({ ...seen, depthTest: false, opacity: .3 })); ghost.renderOrder = 4; g.add(ghost);   // o caminho aparece de leve através das estantes
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(len * 20), .012, 6, false), new THREE.MeshBasicMaterial({ color: '#d9fdff' })); core.position.y = .015; g.add(core);
  const target = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ map: R.T.ring, color: s.c === '#EFEFEF' ? '#6EF2FF' : s.c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  target.rotation.x = -Math.PI / 2; target.position.copy(goal).setY(.02); g.add(target);
  const walker = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.09, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff' })); dot.position.y = .09;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), new THREE.MeshBasicMaterial({ map: R.T.ring, color: '#6EF2FF', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = .02;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#6EF2FF', transparent: true, opacity: .3, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); beam.position.y = 1.2; beam.renderOrder = 4;
  walker.add(dot, halo, beam); g.add(walker);
  R.scene.add(g);
  R.route = { g, tex, curve, len, target, walker, t: 0 };
  if (R.view?.id === id && R.view.back) focus(id, true);      // a vista por trás esconde o corredor: passa para a da frente
  wake();
  return { meters: len };
}
function stepWalker(dt) {
  const r = R.route; r.t = (r.t + dt * 1.1 / r.len) % 1.15;
  const t = Math.min(1, r.t); r.walker.position.copy(r.curve.getPointAt(t));
  r.walker.visible = r.t < 1.08;
}
export function clearRoute() {
  if (!R?.route) return;
  R.scene.remove(R.route.g); R.route.g.traverse(o => { o.geometry?.dispose(); o.material?.dispose?.(); }); R.route.tex.dispose(); R.route = null;
}
