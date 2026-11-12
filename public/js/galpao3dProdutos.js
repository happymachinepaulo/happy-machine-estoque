/* Produtos do Galpão 3D: em vez de caixas, cada prateleira mostra o tipo de peça da categoria dela
   (placas, fontes, computadores, visores, moedeiros e noteiros, refletores e fitas de LED, roteadores e DVR,
   peças de garra, contadoras de cédulas e moedas). Cada modelo é feito de formas simples, em metros, com a
   frente virada para +z e a base em y = 0; os modelos iguais viram um InstancedMesh só. */
import * as THREE from './vendor/three.module.min.js';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

const col = new THREE.Color();
function paint(g, c) {
  g = g.index ? g.toNonIndexed() : g;
  col.set(c); const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g;
}
/* peças: caixa, cilindro, esfera, anel; (x, y, z) é o centro; y0 = base quando "b" */
const P = {
  box: (w, h, d, x, y, z, c, metal = false, ry = 0, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y + h / 2, z); return { g, c, metal }; },
  cyl: (r, h, x, y, z, c, metal = false, rx = 0, rz = 0, seg = 14) => { const g = new THREE.CylinderGeometry(r, r, h, seg); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); g.translate(x, y + (rx || rz ? 0 : h / 2), z); return { g, c, metal }; },
  cone: (r1, r2, h, x, y, z, c, metal = false) => { const g = new THREE.CylinderGeometry(r1, r2, h, 14); g.translate(x, y + h / 2, z); return { g, c, metal }; },
  ball: (r, x, y, z, c, metal = false, half = false) => { const g = new THREE.SphereGeometry(r, 14, 10, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI); g.translate(x, y, z); return { g, c, metal }; },
  ring: (r, t, x, y, z, c) => { const g = new THREE.TorusGeometry(r, t, 8, 22); g.rotateX(Math.PI / 2); g.translate(x, y + t, z); return { g, c, metal: false }; },
};
/* caixa aberta em cima (bandeja, cesto, caixa branca) */
const tray = (w, h, d, c, x = 0, z = 0, t = .008) => [P.box(w, t, d, x, 0, z, c), P.box(w, h, t, x, 0, z - d / 2 + t / 2, c), P.box(w, h, t, x, 0, z + d / 2 - t / 2, c), P.box(t, h, d, x - w / 2 + t / 2, 0, z, c), P.box(t, h, d, x + w / 2 - t / 2, 0, z, c)];

const GREEN = '#2f6b45', BLUE = '#2c4f8f';
/* cada modelo: [largura (x), altura, profundidade (z), peças] */
const MODELS = {
  placa: () => [.24, .03, .17, [P.box(.24, .012, .17, 0, 0, 0, GREEN), P.box(.05, .008, .05, -.05, .012, .02, '#151515'), P.box(.03, .006, .03, .04, .012, -.03, '#151515'), P.box(.02, .006, .06, .08, .012, .03, '#202020'),
    P.cyl(.007, .018, -.09, .012, -.05, '#1d3a8a'), P.cyl(.007, .018, -.075, .012, -.05, '#1d3a8a'), P.cyl(.009, .02, .0, .012, -.055, '#111'), P.box(.16, .012, .012, 0, .012, .075, '#efefef')]],
  placaAzul: () => [.22, .03, .16, [P.box(.22, .012, .16, 0, 0, 0, BLUE), P.box(.06, .008, .06, .03, .012, 0, '#141414'), P.box(.03, .01, .03, -.06, .012, .04, '#c8a03a', true), P.cyl(.008, .02, -.07, .012, -.05, '#333'), P.box(.12, .014, .012, 0, .012, -.07, '#e8e8e8')]],
  placaPreta: () => [.3, .06, .2, [P.box(.3, .05, .2, 0, 0, 0, '#1c1c1f'), P.box(.26, .006, .16, 0, .05, 0, GREEN), P.box(.06, .006, .04, .08, .056, .03, '#111')]],
  domo: () => [.16, .1, .16, [P.cyl(.08, .02, 0, 0, 0, '#ececec'), P.ball(.065, 0, .02, 0, '#1b1b1d', false, true), P.cyl(.07, .006, 0, .02, 0, '#f4f4f4')]],
  fonte: () => [.15, .086, .14, [P.box(.15, .086, .14, 0, 0, 0, '#b6bac0', true), P.cyl(.05, .004, .0, .086, -.01, '#2a2a2c'), P.ring(.048, .004, 0, .086, -.01, '#8d9197'),
    P.box(.012, .012, .05, -.04, .03, .095, '#d22'), P.box(.012, .012, .05, -.025, .03, .095, '#e6c21a'), P.box(.012, .012, .05, -.01, .03, .095, '#111'), P.box(.012, .012, .04, .005, .03, .09, '#d22'), P.box(.03, .02, .02, .045, .02, .08, '#f2f2f2')]],
  fonteChaveada: () => [.2, .05, .11, [P.box(.2, .05, .11, 0, 0, 0, '#a9adb3', true), P.box(.2, .002, .11, 0, .05, 0, '#8c9096', true), P.box(.08, .018, .02, -.05, .01, .06, '#1a1a1a')]],
  gabinete: () => [.19, .42, .43, [P.box(.19, .42, .43, 0, 0, 0, '#141416'), P.box(.17, .38, .006, 0, .02, .216, '#232327'), P.cyl(.008, .004, .04, .36, .22, '#4fa3ff', false, Math.PI / 2), P.box(.12, .03, .004, 0, .3, .22, '#2e2e33'), P.box(.004, .14, .2, .096, .08, -.05, '#2a2a2e')]],
  monitor: () => [.48, .38, .16, [P.box(.48, .3, .025, 0, .07, 0, '#151517'), P.box(.45, .27, .002, 0, .085, .0135, '#0e1a26'), P.box(.04, .08, .02, 0, 0, -.02, '#1d1d20'), P.box(.22, .012, .15, 0, 0, -.02, '#1d1d20')]],
  notebook: () => [.34, .03, .24, [P.box(.34, .022, .24, 0, 0, 0, '#8a1b25'), P.box(.32, .004, .22, 0, .022, 0, '#6e141c')]],
  teclado: () => [.44, .03, .14, [P.box(.44, .02, .14, 0, 0, 0, '#121214'), ...[0, 1, 2, 3].map(i => P.box(.4, .008, .022, 0, .02, -.045 + i * .03, '#2c2c30'))]],
  visorCaixa: () => [.3, .12, .2, [...tray(.3, .1, .2, '#f3f3f3'), ...[-.12, -.08, -.04, 0, .04, .08, .12].map(x => P.box(.008, .09, .17, x, .008, 0, GREEN)), ...[-.12, -.04, .04, .12].map(x => P.box(.01, .05, .1, x + .006, .05, 0, '#3a74e0'))]],
  visorLcd: () => [.12, .02, .07, [P.box(.12, .008, .07, 0, 0, 0, GREEN), P.box(.1, .008, .05, 0, .008, 0, '#3a74e0'), P.box(.09, .002, .04, 0, .016, 0, '#9cc3ff')]],
  camera: () => [.12, .12, .2, [P.cyl(.04, .16, 0, .07, .02, '#f2f2f2', false, Math.PI / 2), P.cyl(.032, .004, 0, .07, .1, '#101418', false, Math.PI / 2), P.box(.03, .07, .03, 0, 0, -.04, '#e6e6e6'), P.box(.08, .01, .08, 0, 0, -.04, '#e6e6e6')]],
  cameraRobo: () => [.12, .14, .12, [P.box(.1, .03, .1, 0, 0, 0, '#f4f4f4'), P.ball(.05, 0, .085, 0, '#f6f6f6'), P.cyl(.02, .004, 0, .09, .05, '#111', false, Math.PI / 2)]],
  noteiro: () => [.1, .22, .19, [P.box(.1, .22, .19, 0, 0, 0, '#19191c'), P.box(.1, .07, .012, 0, .13, .1, '#2b2b2f'), P.box(.07, .004, .014, 0, .165, .102, '#bdbdbd'), P.cyl(.005, .004, .03, .145, .107, '#36e07a', false, Math.PI / 2)]],
  moedeiro: () => [.1, .11, .06, [P.box(.1, .11, .045, 0, 0, -.008, '#b2b6bc', true), P.box(.1, .11, .012, 0, 0, .022, '#18181b'), P.box(.004, .03, .014, 0, .07, .028, '#9a9a9a', true)]],
  refletor: () => [.26, .22, .08, [P.box(.26, .2, .05, 0, .02, 0, '#8f949a', true), P.box(.21, .15, .004, 0, .045, .026, '#e9e6d6'), P.box(.04, .03, .002, 0, .1, .029, '#f0d23a'), P.box(.18, .02, .07, 0, 0, -.005, '#7d8288', true)]],
  fitaLed: () => [.5, .03, .12, [...[-.04, -.02, 0, .02, .04].map((z, i) => P.box(.5, .01, .03, (i % 2) * .01, i % 3 * .008, z, '#f2f2f2')), ...[-.2, -.1, 0, .1, .2].map(x => P.box(.012, .004, .012, x, .028, -.04, '#f4e7a0'))]],
  barraLed: () => [.46, .06, .08, [P.box(.46, .05, .07, 0, 0, 0, '#1b1b1d'), P.box(.44, .02, .004, 0, .015, .036, '#d58a12')]],
  roteador: () => [.25, .06, .18, [P.box(.25, .06, .18, 0, 0, 0, '#22747f'), P.box(.12, .03, .002, -.04, .015, .091, '#ffffff'), P.box(.25, .01, .18, 0, .05, 0, '#1b5e68')]],
  roteadorRoxo: () => [.26, .07, .19, [P.box(.26, .07, .19, 0, 0, 0, '#4b2a8a'), P.box(.1, .03, .002, .05, .02, .096, '#e9d34a')]],
  dvr: () => [.3, .05, .24, [P.box(.3, .045, .24, 0, 0, 0, '#141416'), ...[0, 1, 2, 3].map(i => P.cyl(.003, .003, -.12 + i * .015, .02, .121, '#3cff8a', false, Math.PI / 2)), P.box(.06, .006, .002, .1, .02, .121, '#3a3a3e')]],
  caixaBranca: () => [.34, .2, .26, tray(.34, .19, .26, '#f1f1f1')],
  garrafas: () => [.16, .22, .08, [-.06, -.02, .02, .06].flatMap(x => [P.cyl(.018, .18, x, 0, 0, '#2a9a3c'), P.cyl(.008, .03, x, .18, 0, '#1d1d1d')])],
  garra: () => [.16, .2, .16, [P.cyl(.025, .06, 0, .14, 0, '#c9a227', true), ...[0, 2.094, 4.189].map(a => { const g = new THREE.BoxGeometry(.012, .14, .02); g.translate(0, -.07, 0); g.rotateZ(.35); g.rotateY(a); g.translate(Math.cos(a) * .02, .14, Math.sin(a) * .02); return { g, c: '#d4ad2c', metal: true }; })]],
  joystick: () => [.12, .14, .12, [P.box(.12, .04, .12, 0, 0, 0, '#141416'), P.cyl(.006, .07, 0, .04, 0, '#2b2b2b', true), P.ball(.022, 0, .12, 0, '#d6222c')]],
  cestoAmarelo: () => [.3, .11, .2, [...tray(.3, .1, .2, '#e2c22a'), P.box(.06, .04, .05, -.08, .008, 0, '#bfbfbf'), P.cyl(.02, .05, .05, .008, .03, '#f4f4f4'), P.box(.08, .02, .06, .05, .008, -.04, GREEN)]],
  noteiroAmarelo: () => [.1, .14, .1, [P.cyl(.045, .12, 0, 0, 0, '#e6c52a'), P.cyl(.046, .02, 0, .12, 0, '#141414')]],
  pote: () => [.12, .14, .12, [P.cyl(.055, .13, 0, 0, 0, '#d9dde0'), P.cyl(.057, .012, 0, .13, 0, '#f1f1f1')]],
  contadora: () => [.28, .22, .26, [P.box(.28, .12, .26, 0, 0, 0, '#d8d9db'), P.box(.24, .1, .12, 0, .12, -.05, '#c9cacc', false, 0, -.35), P.box(.1, .04, .004, .06, .08, .131, '#1d2a35'), P.box(.2, .03, .06, 0, .03, .14, '#bfc0c2')]],
  contadoraMoeda: () => [.3, .18, .26, [P.box(.3, .1, .26, 0, 0, 0, '#1a1a1d'), P.cyl(.1, .06, .02, .1, -.02, '#2c3290'), P.cone(.11, .1, .02, .02, .16, -.02, '#3a42b8'), P.box(.08, .03, .004, -.08, .05, .131, '#59d1ff')]],
  tuboAzul: () => [.28, .14, .2, tray(.28, .14, .2, '#2c3290')],
  rolo: () => [.24, .05, .24, [P.ring(.09, .022, 0, 0, 0, '#ececec'), P.ring(.07, .02, 0, .03, 0, '#e2e2e2')]],
  caixa: () => [.3, .2, .25, [P.box(.3, .2, .25, 0, 0, 0, '#c49a6c'), P.box(.3, .002, .06, 0, .2, 0, '#d9bb8f'), P.box(.1, .05, .002, -.06, .07, .126, '#f3f3f3')]],
  caixaBaixa: () => [.32, .12, .24, [P.box(.32, .12, .24, 0, 0, 0, '#bf9466'), P.box(.08, .04, .002, .08, .04, .121, '#f3f3f3')]],
  caixinha: () => [.2, .15, .2, [P.box(.2, .15, .2, 0, 0, 0, '#c7a071'), P.box(.11, .07, .002, 0, .04, .101, '#f4f4f4'), P.box(.2, .002, .04, 0, .15, 0, '#dcc199')]],
  maleta: () => [.46, .16, .34, [P.box(.46, .16, .34, 0, 0, 0, '#c3c7cc', true), P.box(.46, .012, .345, 0, .074, 0, '#1b1b1d'), P.box(.14, .03, .02, 0, .065, .18, '#1b1b1d'), P.box(.03, .03, .01, -.14, .07, .172, '#e8e8e8', true), P.box(.03, .03, .01, .14, .07, .172, '#e8e8e8', true)]],
  seladora: () => [.5, .13, .12, [P.box(.5, .04, .12, 0, 0, 0, '#1f55b8'), P.box(.46, .03, .05, .01, .09, 0, '#2a63d6', false, 0, 0), P.box(.04, .09, .08, -.22, .04, 0, '#1f55b8'), P.box(.4, .006, .012, .02, .04, 0, '#d9d9d9', true)]],
  bobina: () => [.09, .08, .09, [P.cyl(.042, .08, 0, 0, 0, '#f3f3f1'), P.cyl(.012, .082, 0, 0, 0, '#8a8a8a')]],
  adaptador: () => [.1, .06, .15, [P.box(.09, .055, .13, 0, 0, 0, '#17171a'), P.box(.02, .02, .03, 0, .02, .075, '#2a2a2e')]],
  roloAzul: () => [.5, .27, .27, [P.cyl(.135, .5, 0, .135, 0, '#2247c9', false, 0, Math.PI / 2, 18), P.cyl(.04, .502, 0, .135, 0, '#101012', false, 0, Math.PI / 2)]],
  estojo: () => [.1, .13, .2, [P.box(.1, .13, .2, 0, 0, 0, '#c8202a'), P.box(.1, .01, .2, 0, .085, 0, '#8f141c')]],
  estojoRoxo: () => [.1, .13, .2, [P.box(.1, .13, .2, 0, 0, 0, '#3a2fa6'), P.box(.1, .01, .2, 0, .085, 0, '#241c74')]],
  bandejaPreta: () => [.6, .05, .34, tray(.6, .05, .34, '#1a1a1c')],
};
/* o que aparece em cada tipo de prateleira: [modelo, peso, quantos empilhar no máximo, no mínimo] */
export const MIX = {
  placas: [['placa', 5, 4], ['placaAzul', 2, 3], ['placaPreta', 2, 2], ['domo', 1, 1], ['fonte', 1, 2], ['caixaBaixa', 1, 2]],
  fontes: [['fonte', 8, 3], ['fonteChaveada', 3, 3], ['caixa', 1, 1]],
  pcs: [['gabinete', 4, 1], ['monitor', 2, 1], ['notebook', 2, 3], ['teclado', 2, 3], ['caixa', 1, 2]],
  visores: [['visorCaixa', 4, 2], ['visorLcd', 3, 4], ['camera', 2, 1], ['cameraRobo', 2, 1], ['caixaBaixa', 1, 2]],
  pagamento: [['noteiro', 5, 1], ['moedeiro', 4, 2], ['fonteChaveada', 2, 2], ['caixaBaixa', 1, 2]],
  led: [['refletor', 5, 2], ['fitaLed', 4, 3], ['barraLed', 2, 3]],
  rede: [['roteador', 4, 4], ['roteadorRoxo', 2, 3], ['dvr', 3, 3], ['caixaBranca', 2, 1], ['garrafas', 1, 1], ['caixa', 2, 2]],
  garra: [['cestoAmarelo', 4, 1], ['garra', 3, 1], ['joystick', 3, 1], ['noteiroAmarelo', 3, 2], ['pote', 2, 1], ['placa', 2, 3]],
  contadoras: [['contadora', 4, 1], ['contadoraMoeda', 3, 1], ['tuboAzul', 3, 2], ['rolo', 2, 3]],
  estojos: [['estojo', 4, 2], ['estojoRoxo', 4, 2], ['tuboAzul', 3, 2], ['contadoraMoeda', 1, 1]],
  redeTopo: [['caixa', 4, 3, 2], ['roteador', 4, 7, 3], ['roteadorRoxo', 2, 6, 2], ['caixaBaixa', 2, 5, 2]],
  refletores: [['refletor', 8, 2], ['caixaBaixa', 1, 1]],
  caixasAltas: [['caixaBaixa', 6, 6, 4], ['caixa', 3, 3, 2]],
  caixas: [['caixa', 5, 2], ['caixaBaixa', 3, 3]],
  chaveadas: [['fonteChaveada', 8, 9, 4], ['caixaBaixa', 2, 5, 3], ['caixinha', 2, 4, 2]],
  atx: [['fonte', 9, 6, 3]],
  chao: [['caixa', 5, 1], ['roloAzul', 2, 1], ['caixaBaixa', 2, 2]],
  diversos: [['caixa', 4, 2], ['caixaBaixa', 3, 3], ['maleta', 2, 1], ['seladora', 1, 1], ['caixaBranca', 2, 1], ['pote', 1, 1]],
  adaptadores: [['adaptador', 7, 2], ['fonte', 2, 1], ['caixaBaixa', 1, 1]],
  caixinhas: [['caixinha', 9, 2], ['caixaBaixa', 1, 2]],
  aberta: [['bobina', 5, 2], ['caixa', 3, 1], ['caixaBaixa', 2, 2], ['pote', 1, 1], ['caixinha', 2, 1]],
  bandeja: [['bandejaPreta', 6, 1], ['caixinha', 1, 1]],
};

const cache = {};
function model(key) {
  if (cache[key]) return cache[key];
  const [w, h, d, parts] = MODELS[key]();
  const merge = list => list.length ? mergeGeometries(list.map(p => paint(p.g, p.c))) : null;
  return cache[key] = { w, h, d, matte: merge(parts.filter(p => !p.metal)), metal: merge(parts.filter(p => p.metal)) };
}
const pickW = (r, mix) => { const tot = mix.reduce((a, m) => a + m[1], 0); let x = r() * tot; for (const m of mix) if ((x -= m[1]) < 0) return m; return mix[0]; };

/* coleta as posições e no fim cria um InstancedMesh por modelo */
export class Products {
  constructor() { this.list = {}; this.q = new THREE.Quaternion(); this.m = new THREE.Matrix4(); }
  add(key, x, y, z, yaw) { (this.list[key] ||= []).push(this.m.clone().compose(new THREE.Vector3(x, y, z), this.q.clone().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1))); }
  build(parent) {
    const matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, metalness: .05 });
    const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .32, metalness: .85 });
    for (const [key, mats] of Object.entries(this.list)) {
      const md = model(key);
      for (const [geo, mat] of [[md.matte, matte], [md.metal, metal]]) {
        if (!geo) continue;
        const im = new THREE.InstancedMesh(geo, mat, mats.length);
        mats.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = im.receiveShadow = true; parent.add(im);
      }
    }
  }
}

/* enche as prateleiras de um móvel (f = eixos do móvel, levels = alturas das prateleiras, roof = altura do tampo) */
export function fillProducts(s, f, levels, r, out, roof) {
  const yaw = Math.atan2(f.front.x, f.front.z);
  levels.forEach((y, li) => {
    const mix = MIX[Array.isArray(s.fill) ? s.fill[li] : s.fill] || MIX.placas;
    const top = (li + 1 < levels.length ? levels[li + 1] : roof || y + .45) - .03, room = top - y - .02;
    let a = -f.len / 2 + .03;
    while (a < f.len / 2 - .08) {
      if (r() < .07) { a += .08 + r() * .18; continue; }               // vão vazio, como na estante de verdade
      let m = pickW(r, mix), md = model(m[0]);
      if (md.h > room || a + md.w > f.len / 2 - .02) { m = mix.find(x => model(x[0]).h <= room && a + model(x[0]).w <= f.len / 2 - .02); if (!m) break; md = model(m[0]); }
      const rows = md.d < f.dep * .48 ? [-1, 1] : [0];
      for (const row of rows) {
        if (row && r() < .18) continue;
        const off = row ? row * (f.dep / 2 - md.d / 2 - .015) : (f.dep - md.d) / 2 * (r() - .5) * .5;
        const cap = Math.max(1, Math.min(m[2], Math.floor(room / md.h))), lo = Math.min(cap, m[3] || 1), n = lo + Math.floor(r() * (cap - lo + 1));
        for (let k = 0; k < n; k++) {
          const p = f.at(a + md.w / 2 + (r() - .5) * .01, off, y + .012 + k * md.h);
          out.add(m[0], p.x, p.y, p.z, yaw + (r() - .5) * (k ? .2 : .1));
        }
      }
      a += md.w + .01 + r() * .03;
    }
  });
}
