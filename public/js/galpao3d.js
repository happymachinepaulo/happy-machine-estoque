/* Galpão em 3D: a sala do estoque montada a partir das fotos (planta em shelves.js).
   Desenha paredes, piso, luzes do teto, estantes pretas de tela, a estante de alvenaria, os cestos, a pilha
   embrulhada, os fliperamas, a escada e o ar-condicionado; cuida da câmera (girar, aproximar, voar até a estante),
   do destaque das estantes, das etiquetas e da rota da porta até a estante. A interface em volta fica em galpao.js. */
import * as THREE from './vendor/three.module.min.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { SHELVES, ROOM, PROPS } from './shelves.js';

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
  return { mesh, grid, card, floor, bubbles, label, route, ring, wrap, panel };
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

/* sistema de eixos de uma estante: comprimento (run), profundidade (para a frente) */
function frame(s) {
  const cx = s.x + s.w / 2, cz = s.z + s.d / 2, alongX = s.w >= s.d;
  const run = alongX ? V(1, 0, 0) : V(0, 0, 1), len = alongX ? s.w : s.d, dep = alongX ? s.d : s.w;
  const front = FACE[s.face] || V(0, 0, 1);
  const at = (r, f, y) => V(cx + run.x * r + front.x * f, y, cz + run.z * r + front.z * f);
  const rot = alongX ? 0 : Math.PI / 2;
  return { cx, cz, run, front, len, dep, at, rot };
}

/* o que vai em cada prateleira, por tipo de estante (cores tiradas das fotos) */
const CARD = ['#c49a6c', '#b88d5f', '#d0a878', '#bf9466', '#caa273'];
const RECIPES = {
  placas: r => r() < .55 ? ['plain', .26, .025, .19, pick(r, ['#2c5a3a', '#335f40', '#24452f', '#2a3f5a'])] : r() < .5 ? ['card', .3, .16, .24, pick(r, CARD)] : ['plain', .22, .12, .18, pick(r, ['#1a1a1c', '#e7e7e7', '#2d6cdf'])],
  fontes: r => r() < .7 ? ['metal', .15, .09, .14, '#b9bdc3'] : ['card', .3, .18, .25, pick(r, CARD)],
  pcs: r => r() < .5 ? ['plain', .19, .42, .44, '#141416'] : r() < .4 ? ['plain', .34, .03, .24, pick(r, ['#8e1b26', '#2b2b2e'])] : ['card', .32, .2, .26, pick(r, CARD)],
  visores: r => r() < .5 ? ['plain', .3, .1, .22, '#f1f1f1'] : r() < .5 ? ['plain', .22, .12, .14, '#202024'] : ['card', .26, .14, .22, pick(r, CARD)],
  pagamento: r => r() < .45 ? ['plain', .14, .22, .2, '#1a1a1d'] : r() < .5 ? ['metal', .16, .1, .14, '#b4b8be'] : ['card', .26, .16, .22, pick(r, CARD)],
  rede: r => r() < .35 ? ['plain', .24, .07, .18, pick(r, ['#1f6f7a', '#2a7f8c', '#4b2a8a', '#e8c51a'])] : r() < .4 ? ['plain', .34, .2, .26, '#f2f2f2'] : ['card', .3, .22, .26, pick(r, CARD)],
  garra: r => r() < .3 ? ['plain', .3, .1, .2, '#d9bd2a'] : r() < .4 ? ['plain', .16, .18, .16, pick(r, ['#cdb43a', '#c9c9c9', '#1c1c1f', '#2f5a3e'])] : r() < .5 ? ['card', .28, .16, .24, pick(r, CARD)] : ['plain', .22, .06, .16, '#1f7a3a'],
  contadoras: r => r() < .4 ? ['plain', .3, .18, .26, '#2c3290'] : r() < .5 ? ['plain', .28, .22, .26, '#dcdcdc'] : ['plain', .2, .1, .14, pick(r, ['#c8202e', '#1b1b1e'])],
  led: r => r() < .45 ? ['metal', .28, .24, .07, '#a9adb3'] : r() < .6 ? ['plain', .5, .03, .12, '#f2f2f2'] : ['plain', .45, .06, .1, '#d58a12'],
};
function fillShelf(s, B, r, levels) {
  const f = frame(s), recipe = RECIPES[s.fill] || RECIPES.placas;
  levels.forEach((y, li) => {
    const top = li + 1 < levels.length ? levels[li + 1] - .03 : y + .38;
    const room = top - y - .02, want = room * (.25 + r() * .4);
    let a = -f.len / 2 + .03;
    while (a < f.len / 2 - .1) {
      if (r() < .06) { a += .1 + r() * .2; continue; }         // vão vazio
      const [k, sx0, sy0, sz0, col] = recipe(r), sc = 1.1 + r() * .3;
      const sx = Math.min(sx0 * sc, f.len / 2 - a - .02), sy = Math.min(sy0 * sc, room), sz = Math.min(sz0 * sc * 1.15, f.dep - .04);
      if (sx < .06) break;
      // fileira de trás (aparece por cima) e da frente
      for (const row of sz < f.dep * .55 ? [-1, 1] : [0]) {
        let yy = y + .012, c = col, kk = k;
        const off = row ? row * (f.dep / 2 - sz / 2 - .02) : (r() - .5) * (f.dep - sz) * .5;
        let cnt = 0;
        while (yy + sy <= y + .012 + Math.max(want, sy) + .001 && cnt++ < (sy < .05 ? 1 : 2)) {
          const p = f.at(a + sx / 2, off, yy);
          B.add(kk, p.x, p.y, p.z, sx - .008, sy - .004, sz, c, f.rot + (r() - .5) * .06);
          yy += sy; if (r() < .35) { const n2 = recipe(r); if (n2[2] * sc <= sy * 1.3) { kk = n2[0]; c = n2[4]; } }
        }
      }
      a += sx + .008 + r() * .03;
    }
  });
}

/* estante preta de metal com prateleiras de tela (e fundo de tela nas "tela") */
function metalShelf(s, M, B, r, g) {
  const f = frame(s), lv = s.lv || 5, h = s.h, bays = Math.max(1, Math.round(f.len / .95)), bay = f.len / bays;
  const post = new THREE.BoxGeometry(.03, h, .03);
  for (let i = 0; i <= bays; i++) for (const side of [-1, 1]) {
    const m = new THREE.Mesh(post, M.steel), p = f.at(-f.len / 2 + i * bay, side * (f.dep / 2 - .015), h / 2); m.position.copy(p); m.castShadow = true; g.add(m);
  }
  const levels = []; for (let i = 0; i < lv; i++) levels.push(.12 + i * (h - .16) / (lv - 1));
  levels.forEach(y => {
    const deck = new THREE.PlaneGeometry(f.len, f.dep); deck.rotateX(-Math.PI / 2); if (f.rot) deck.rotateY(f.rot);
    const uv = deck.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * f.len / .26, uv.getY(i) * f.dep / .26);
    const dm = new THREE.Mesh(deck, M.deck); dm.position.set(f.cx, y, f.cz); dm.receiveShadow = true; dm.castShadow = true; g.add(dm);
    for (const side of [-1, 1]) {           // travessas da frente e de trás
      const rail = new THREE.Mesh(new THREE.BoxGeometry(f.len, .035, .02), M.steel); rail.rotation.y = f.rot; rail.position.copy(f.at(0, side * (f.dep / 2 - .01), y)); g.add(rail);
    }
  });
  if (s.kind === 'tela') {
    const back = new THREE.PlaneGeometry(f.len, h - .1); if (f.rot) back.rotateY(f.rot);
    const uv = back.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * f.len / .26, uv.getY(i) * (h - .1) / .26);
    const bm = new THREE.Mesh(back, M.back); bm.position.copy(f.at(0, -f.dep / 2 + .01, h / 2 + .03)); g.add(bm);
  }
  fillShelf(s, B, r, levels);
  return { levels };
}

/* estante de alvenaria branca do fundo (com a caixa 017, a 023, as telas embaixo e os painéis em cima) */
function masonry(s, M, B, r, g, T) {
  const f = frame(s), h = s.h, levels = [0, .5, .98, 1.46, 1.92, h], div = 4;
  const add = (geo, mat, p) => { const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.rotation.y = f.rot; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  levels.forEach((y, i) => add(new THREE.BoxGeometry(f.len + .08, i === 0 ? .1 : .05, f.dep), M.masonry, f.at(0, 0, i === 0 ? .05 : y)));
  for (let i = 0; i <= div; i++) add(new THREE.BoxGeometry(i % div ? .06 : .1, h, f.dep), M.masonry, f.at(-f.len / 2 + i * f.len / div, 0, h / 2));
  const col = f.len / div;
  for (let c = 0; c < div; c++) {
    const c0 = -f.len / 2 + c * col + .06, c1 = c0 + col - .1;
    // embaixo: telas pretas em pé
    for (let a = c0; a < c1 - .03; a += .035 + r() * .01) { const p = f.at(a, (r() - .5) * .06, .1); B.add('plain', p.x, p.y, p.z, .025, .3 + r() * .08, .3, r() < .2 ? '#3a3a3e' : '#121214', f.rot + (r() - .5) * .1); }
    // 2ª: caixa vermelha, caixas pretas e papelão
    let a = c0;
    while (a < c1 - .3) {
      const t = r(), w = t < .25 ? .42 : .3 + r() * .1;
      const p = f.at(a + w / 2, 0, .525);
      if (t < .2) B.add('plain', p.x, p.y, p.z, w, .32, .36, '#c42a2a', f.rot); else if (t < .45) B.add('plain', p.x, p.y, p.z, w, .38, .36, '#151517', f.rot); else B.add('card', p.x, p.y, p.z, w, .3, .34, pick(r, CARD), f.rot);
      a += w + .03;
    }
    // 3ª e 4ª: caixas de papelão e impressoras
    [1.005, 1.485].forEach((y, k) => { let a2 = c0; while (a2 < c1 - .25) { const w = .25 + r() * .15, hh = .2 + r() * .18; const p = f.at(a2 + w / 2, (r() - .5) * .05, y); const pr = k === 1 && r() < .3; B.add(pr ? 'plain' : 'card', p.x, p.y, p.z, w, hh, .34, pr ? pick(r, ['#2a2a2e', '#3b3b40', '#f2f2f2']) : pick(r, CARD), f.rot); if (!pr && hh < .25 && r() < .5) B.add('card', p.x, p.y + hh, p.z, w * .9, .16, .32, pick(r, CARD), f.rot); a2 += w + .02 + r() * .05; } });
    // 5ª: caixas e cestos
    let a3 = c0; while (a3 < c1 - .25) { const w = .26 + r() * .14; const p = f.at(a3 + w / 2, 0, 1.945); B.add(r() < .3 ? 'plain' : 'card', p.x, p.y, p.z, w, .22 + r() * .1, .32, r() < .3 ? '#ececec' : pick(r, CARD), f.rot); a3 += w + .04; }
  }
  // caixas pretas numeradas 017 e 023 (iguais às das fotos)
  [['017', 1, .525, .5], ['023', 2, 1.485, .55]].forEach(([txt, c, y, w]) => {
    const front = new THREE.MeshStandardMaterial({ map: T.label(txt), roughness: .5 }), mats = [M.black, M.black, M.black, M.black, M.black, M.black];
    const fi = { s: 4, n: 5, e: 0, w: 1 }[s.face]; mats[fi] = front;
    const p = f.at(-f.len / 2 + c * col + col * .55, .02, y);
    const m = new THREE.Mesh(new THREE.BoxGeometry(f.rot ? .36 : w, .36, f.rot ? w : .36), mats); m.position.set(p.x, p.y + .18, p.z); m.castShadow = true; g.add(m);
  });
  // painéis brancos em cima (os triângulos brancos das fotos)
  for (let a = -f.len / 2 + .15; a < f.len / 2 - .1; a += .2 + r() * .08) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(.02, .38, .3), M.white); const p = f.at(a, 0, h + .2); m.position.copy(p); m.rotation.y = f.rot + Math.PI / 2; m.rotation.z = (r() - .5) * .4; m.castShadow = true; g.add(m);
  }
  return { levels };
}

/* cestos pretos empilháveis cheios de cabos */
function baskets(s, M, B, r, g) {
  const f = frame(s), cols = 2, rows = 6, cw = f.len / cols, bh = s.h / rows;
  const geo = new THREE.BoxGeometry(cw - .03, bh - .02, f.dep - .02);
  const mat = new THREE.MeshStandardMaterial({ color: '#6a6a72', map: g.userData.T.mesh, roughness: .6 });
  const cab = ['#2050c8', '#c42a2a', '#1a1a1a', '#e8e8e8', '#2a8f4a', '#f2d21b', '#ff7a1a'];
  for (let c = 0; c < cols; c++) for (let k = 0; k < rows; k++) {
    const p = f.at(-f.len / 2 + cw * (c + .5), (r() - .5) * .03 + k * .012, k * bh + bh / 2);
    const m = new THREE.Mesh(geo, mat); m.position.copy(p); m.rotation.y = f.rot; m.castShadow = true; g.add(m);
    for (let i = 0; i < 5; i++) { const q = f.at(-f.len / 2 + cw * (c + .15 + i * .17), f.dep / 2 - .02, k * bh + bh * .25); B.add('plain', q.x, q.y, q.z, .1 + r() * .06, bh * (.45 + r() * .35), .05, pick(r, cab), f.rot + r() * .5); }
  }
  return { levels: [0] };
}

/* ── a sala ── */
function buildRoom(M, T, B, r, g) {
  const { w, l, h } = ROOM, t = .12;
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, l), M.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(w / 2, 0, l / 2); fl.receiveShadow = true; g.add(fl);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 2 * t, .14, l + 2 * t), new THREE.MeshStandardMaterial({ color: '#2a2a2e', roughness: .9 })); slab.position.set(w / 2, -.071, l / 2); slab.receiveShadow = true; g.add(slab);
  const walls = [];
  const wall = (x0, z0, x1, z1, y0, y1, n) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(t, Math.abs(x1 - x0)), y1 - y0, Math.max(t, Math.abs(z1 - z0))), M.wall);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.receiveShadow = true; m.castShadow = true; m.userData.n = n; g.add(m); walls.push(m); return m;
  };
  wall(-t, -t / 2, w + t, -t / 2, 0, h, V(0, 0, 1));                 // fundo (alvenaria)
  wall(-t / 2, 0, -t / 2, l, 0, h, V(1, 0, 0));                      // esquerda
  wall(w + t / 2, 0, w + t / 2, l, 0, h, V(-1, 0, 0));               // direita (ar-condicionado)
  const d = ROOM.door;                                                // frente, com a porta
  wall(-t, l + t / 2, d.x, l + t / 2, 0, h, V(0, 0, -1));
  wall(d.x + d.w, l + t / 2, w + t, l + t / 2, 0, h, V(0, 0, -1));
  wall(d.x, l + t / 2, d.x + d.w, l + t / 2, 2.1, h, V(0, 0, -1));
  const door = new THREE.Mesh(new THREE.BoxGeometry(d.w - .08, 2.06, .04), new THREE.MeshStandardMaterial({ color: '#3b3d42', roughness: .4, metalness: .5 }));
  door.position.set(d.x + d.w / 2, 1.03, l + t + .03); g.add(door); walls.push(Object.assign(door, { userData: { n: V(0, 0, -1) } }));
  // teto com as luzes quadradas de LED
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, l), M.ceil); ceil.rotation.x = Math.PI / 2; ceil.position.set(w / 2, h, l / 2); g.add(ceil);
  PROPS.luzes.forEach(([x, z]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), M.light); p.rotation.x = Math.PI / 2; p.position.set(x, h - .01, z); g.add(p);
    const pl = new THREE.PointLight('#fff6ea', 3.2, 6, 1.4); pl.position.set(x, h - .05, z); g.add(pl);
  });
  return { walls, ceil };
}

function buildProps(M, T, B, r, g) {
  const add = (geo, mat, x, y, z, ry = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  // pilha de caixas embrulhadas em filme (com as etiquetas amarelas)
  const P = PROPS.pilha, px = P.x + P.w / 2, pz = P.z + P.d / 2;
  add(new THREE.BoxGeometry(P.w, P.h, P.d), M.wrap, px, P.h / 2, pz);
  add(new THREE.BoxGeometry(P.w + .03, P.h + .02, P.d + .03), M.film, px, P.h / 2 + .005, pz).castShadow = false;
  add(new THREE.BoxGeometry(.5, .3, .4), M.card, px - .15, .15, pz + .55).material = M.card;
  B.add('card', px + .1, 0, pz + .55, .4, .22, .36, '#c9a274', .2);
  // armação vazia ao lado da estante B
  const Fm = PROPS.moldura, post = new THREE.BoxGeometry(.03, Fm.h, .03);
  for (const [dx, dz] of [[0, 0], [Fm.w, 0], [0, Fm.d], [Fm.w, Fm.d]]) add(post, M.steel, Fm.x + dx, Fm.h / 2, Fm.z + dz);
  for (const y of [Fm.h - .02, .9]) { add(new THREE.BoxGeometry(.03, .03, Fm.d), M.steel, Fm.x, y, Fm.z + Fm.d / 2); add(new THREE.BoxGeometry(.03, .03, Fm.d), M.steel, Fm.x + Fm.w, y, Fm.z + Fm.d / 2); }
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(Fm.d, Fm.w), M.deck); deck.rotation.x = -Math.PI / 2; deck.rotation.z = Math.PI / 2; deck.position.set(Fm.x + Fm.w / 2, .9, Fm.z + Fm.d / 2); g.add(deck);
  B.add('plain', Fm.x + Fm.w / 2, .9, Fm.z + .3, .3, .05, .4, '#1d1d20'); B.add('plain', Fm.x + Fm.w / 2, .95, Fm.z + .3, .32, .03, .42, '#2a2a2e');
  // impressoras e CPU em cima da estante B
  { const Bs = SHELVES.find(x => x.id === 'B'), bx = Bs.x + Bs.w / 2, bh = Bs.h + .01;
    B.add('plain', bx, bh, Bs.z + .3, .42, .26, .4, '#f1f1f1'); B.add('plain', bx, bh, Bs.z + .85, .42, .3, .42, '#2d2d31'); B.add('plain', bx + .02, bh, Bs.z + 1.35, .2, .42, .42, '#121214'); }
  // fliperamas deitados (estampa de bolhas coloridas)
  PROPS.fliperamas.forEach((F, i) => {
    const mats = [M.arcadeSide, M.arcadeSide, M.arcade, M.arcadeSide, M.arcade, M.arcade];
    add(new THREE.BoxGeometry(F.w, F.h, F.d), mats, F.x + F.w / 2, F.h / 2, F.z + F.d / 2);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.1, 20, 14), M.white); ball.position.set(F.x + .25 + i * .5, F.h + .1, F.z + .28); g.add(ball);
  });
  // escada de alumínio encostada na pilha
  const E = PROPS.escada, lad = new THREE.Group(); lad.position.set(E.x, 0, E.z); lad.rotation.set(0, -.5, -.18);
  for (const s of [-.2, .2]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(.05, 2.2, .03), M.alu); rail.position.set(s, 1.1, 0); rail.castShadow = true; lad.add(rail); }
  for (let y = .25; y < 2.1; y += .28) { const st = new THREE.Mesh(new THREE.BoxGeometry(.4, .03, .06), M.alu); st.position.set(0, y, 0); lad.add(st); }
  g.add(lad);
  // cadeira preta
  const C = PROPS.cadeira, ch = new THREE.Group(); ch.position.set(C.x, 0, C.z); ch.rotation.y = .6;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.48, .08, .46), M.black); seat.position.y = .48; ch.add(seat);
  const bk = new THREE.Mesh(new THREE.BoxGeometry(.46, .55, .06), M.black); bk.position.set(0, .82, -.22); bk.rotation.x = -.12; ch.add(bk);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .4), M.steel); pole.position.y = .26; ch.add(pole);
  for (let i = 0; i < 5; i++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(.3, .03, .04), M.steel); leg.rotation.y = i * Math.PI * 2 / 5; leg.position.set(Math.cos(i * 1.2566) * .15, .06, -Math.sin(i * 1.2566) * .15); ch.add(leg); }
  ch.traverse(o => { o.castShadow = true; }); g.add(ch);
  // ar-condicionado na parede direita, com o cano branco
  const A = PROPS.ar, w = ROOM.w;
  add(new THREE.BoxGeometry(.24, .3, .95), M.white, w - .12, A.y, A.z);
  add(new THREE.BoxGeometry(.02, .02, .8), new THREE.MeshStandardMaterial({ color: '#9aa0a6' }), w - .245, A.y - .1, A.z);
  add(new THREE.CylinderGeometry(.03, .03, .9), M.white, w - .05, A.y + .15, A.z - .7).rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(.025, .025, A.y), M.white, w - .05, A.y / 2, A.z - 1.12);
  // caixas soltas no chão (como nas fotos)
  PROPS.soltas.forEach(([x, z]) => B.add('card', x, 0, z, .42 + r() * .1, .28 + r() * .08, .36, pick(r, CARD), r() * .4));
  PROPS.caixotes.forEach(([x, z]) => B.add('plain', x, 0, z, .55, .3, .4, '#151517'));
}

/* ── rota: caminho mais curto na planta (grade de 10 cm) ── */
function obstacles() {
  const o = SHELVES.map(s => [s.x, s.z, s.w, s.d]);
  const P = PROPS; o.push([P.pilha.x, P.pilha.z, P.pilha.w, P.pilha.d], [P.moldura.x, P.moldura.z, P.moldura.w, P.moldura.d], ...P.fliperamas.map(F => [F.x, F.z, F.w, F.d]));
  return o;
}
function findPath(from, to) {
  const S = .1, W = Math.round(ROOM.w / S), L = Math.round(ROOM.l / S), pad = .2, block = new Uint8Array(W * L);
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

/* ── destaque das estantes ── */
function glowFor(s, info) {
  const g = new THREE.Group(), pad = .05, top = (s.kind === 'alvenaria' ? s.h + .45 : s.h) + .05;
  const box = new THREE.BoxGeometry(s.w + pad * 2, top, s.d + pad * 2);
  const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: s.c, transparent: true, opacity: .1, blending: THREE.AdditiveBlending, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: s.c, transparent: true, opacity: 1 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(s.w + .9, s.d + .9), new THREE.MeshBasicMaterial({ map: R.T.ring, color: s.c, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = .015 - top / 2;
  g.add(fill, edges, floor); g.position.set(s.x + s.w / 2, top / 2, s.z + s.d / 2); g.visible = false; g.renderOrder = 5;
  g.userData = { fill, edges, floor, base: new THREE.Color(s.c) };
  return g;
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
  R = { renderer, scene, camera, controls, el, T, M, hooks, glows: {}, hits: [], state: {}, raf: 0, fly: null, route: null, walker: null, clock: new THREE.Clock(), alive: true };

  scene.add(new THREE.HemisphereLight('#f4f6ff', '#4a4741', .7));
  const sun = new THREE.DirectionalLight('#fff4e6', 1.6); sun.position.set(ROOM.w * .8, 9, ROOM.l * .2); sun.target.position.set(ROOM.w / 2, 0, ROOM.l / 2);
  sun.castShadow = true; sun.shadow.mapSize.set(small ? 1024 : 2048, small ? 1024 : 2048); Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 20 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02;
  scene.add(sun, sun.target);

  const world = new THREE.Group(); world.userData.T = T; scene.add(world);
  const B = new Batch(), r = rng(20261110);
  R.room = buildRoom(M, T, B, r, world);
  buildProps(M, T, B, r, world);
  const hitGeo = new THREE.BoxGeometry(1, 1, 1), hitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (const s of SHELVES) {
    const g = new THREE.Group(); g.userData.T = T; world.add(g);
    if (s.kind === 'alvenaria') masonry(s, M, B, rng(s.id.charCodeAt(0) * 97), g, T);
    else if (s.kind === 'cestos') baskets(s, M, B, rng(s.id.charCodeAt(0) * 97), g);
    else metalShelf(s, M, B, rng(s.id.charCodeAt(0) * 97), g);
    const hit = new THREE.Mesh(hitGeo, hitMat); hit.scale.set(s.w + .1, s.h + .1, s.d + .1); hit.position.set(s.x + s.w / 2, (s.h + .1) / 2, s.z + s.d / 2); hit.userData.shelf = s.id; world.add(hit); R.hits.push(hit);
    const gl = glowFor(s); scene.add(gl); R.glows[s.id] = gl;
  }
  B.build(M, world);

  // marca da entrada no chão
  const ent = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: T.ring, color: '#6EF2FF', transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false }));
  ent.rotation.x = -Math.PI / 2; ent.position.set(ROOM.door.x + ROOM.door.w / 2, .014, ROOM.l - .5); scene.add(ent); R.entry = ent;

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

/* paredes entre a câmera e a sala somem (casa de bonecas); o teto some visto de cima */
function walls() {
  const c = R.camera.position, mid = V(ROOM.w / 2, 0, ROOM.l / 2);
  for (const w of R.room.walls) { const n = w.userData.n, p = w.position; const out = (c.x - p.x) * n.x + (c.z - p.z) * n.z < -.05; w.visible = !out; }
  R.room.ceil.visible = c.y < ROOM.h - .05 && c.x > 0 && c.x < ROOM.w && c.z > 0 && c.z < ROOM.l;
  void mid;
}

function pulse(t) {
  const st = R.state, k = .5 + .5 * Math.sin(t * 4);
  for (const s of SHELVES) {
    const g = R.glows[s.id], u = g.userData;
    const sel = st.sel === s.id, hov = st.hover === s.id, hit = st.hits?.has(s.id), low = st.mode === 'divergencia' && st.low?.[s.id];
    g.visible = sel || hov || hit || !!low;
    if (!g.visible) continue;
    const col = low && !sel ? '#ff3b55' : hit && !sel ? '#6EF2FF' : s.c;
    u.edges.material.color.set(col); u.fill.material.color.set(col); u.floor.material.color.set(col);
    u.fill.material.opacity = sel ? .12 + .1 * k : hov ? .08 : .07 + .1 * k;
    u.edges.material.opacity = sel ? 1 : hov ? .7 : .55 + .45 * k;
    u.floor.material.opacity = sel ? .5 + .3 * k : .35;
  }
  if (R.entry) R.entry.material.opacity = R.route ? .45 + .35 * k : .25;
  if (R.route?.target) { const s = 1 + .12 * k; R.route.target.scale.set(s, s, s); }
}

/* etiquetas HTML presas às estantes */
function tags() {
  const box = R.hooks.tagBox?.(); if (!box) return;
  const w = R.el.clientWidth, h = R.el.clientHeight, v = new THREE.Vector3();
  for (const b of box.children) {
    const s = SHELVES.find(x => x.id === b.dataset.shelf); if (!s) continue;
    { const f = frame(s); v.set(f.cx + f.front.x * f.dep * .6, (s.kind === 'alvenaria' ? s.h + .5 : s.h) + .18, f.cz + f.front.z * f.dep * .6).project(R.camera); }
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
  const portrait = R.el.clientHeight > R.el.clientWidth * 1.05, far = portrait ? 1.65 : 1;
  const t = portrait ? V(ROOM.w / 2, 0, ROOM.l / 2 + .5) : V(ROOM.w / 2 - .1, .2, ROOM.l / 2 - .2);
  const asp = R.el.clientWidth / Math.max(1, R.el.clientHeight), dist = 4.7 / (Math.tan(THREE.MathUtils.degToRad(R.camera.fov / 2)) * Math.min(1, asp));
  const p = portrait ? t.clone().add(V(.18, .86, .48).normalize().multiplyScalar(dist)) : V(ROOM.w / 2 + 5.2 * far, 7.4 * far, ROOM.l / 2 + 6.4 * far);
  if (instant) { R.camera.position.copy(p); R.controls.target.copy(t); R.controls.update(); return Promise.resolve(); }
  return flyTo(p, t, 1000);
}
export function focus(id) {
  const s = SHELVES.find(x => x.id === id); if (!R || !s) return Promise.resolve();
  const f = frame(s), portrait = R.el.clientHeight > R.el.clientWidth * 1.05;
  const target = V(f.cx, s.h * .4, f.cz), dist = Math.max(3.4, f.len * 1.15) * (portrait ? 1.45 : 1);
  const side = f.run.clone().multiplyScalar(f.len * .35 + .6);
  const pos = target.clone().addScaledVector(f.front, dist).add(side).setY(2.6 + dist * .5);
  if (!portrait && R.el.clientWidth > 760) {      // o cartão fica à direita: a estante aparece mais à esquerda
    const right = target.clone().sub(pos).cross(V(0, 1, 0)).setY(0).normalize().multiplyScalar(dist * .32);
    pos.add(right); target.add(right);
  }
  return flyTo(pos, target, 1150);
}

/* ── estado vindo da interface ── */
export function update(st) { if (!R) return; Object.assign(R.state, st); refresh(); }
function refresh() { if (R && !R.raf) wake(); }

/* rota da porta até a frente da estante, com um pontinho andando por ela */
export function route(id) {
  clearRoute();
  const s = SHELVES.find(x => x.id === id); if (!R || !s) return null;
  const f = frame(s), goal = V(f.cx, 0, f.cz).addScaledVector(f.front, f.dep / 2 + .45);
  const start = V(ROOM.door.x + ROOM.door.w / 2, 0, ROOM.l - .35);
  const curve = smooth(findPath(start, goal)), len = curve.getLength();
  const tex = R.T.route.clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(ribbon(curve, .42), new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: '#9ff8ff' })));
  const core = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.ceil(len * 20), .012, 6, false), new THREE.MeshBasicMaterial({ color: '#d9fdff' })); core.position.y = .015; g.add(core);
  const target = new THREE.Mesh(new THREE.PlaneGeometry(.9, .9), new THREE.MeshBasicMaterial({ map: R.T.ring, color: s.c === '#EFEFEF' ? '#6EF2FF' : s.c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  target.rotation.x = -Math.PI / 2; target.position.copy(goal).setY(.02); g.add(target);
  const walker = new THREE.Group();
  const dot = new THREE.Mesh(new THREE.SphereGeometry(.09, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffffff' })); dot.position.y = .09;
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(.6, .6), new THREE.MeshBasicMaterial({ map: R.T.ring, color: '#6EF2FF', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); halo.rotation.x = -Math.PI / 2; halo.position.y = .02;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.6, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#6EF2FF', transparent: true, opacity: .25, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.y = .8;
  walker.add(dot, halo, beam); g.add(walker);
  R.scene.add(g);
  R.route = { g, tex, curve, len, target, walker, t: 0 };
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
