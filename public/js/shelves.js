/* Estantes do galpão e a planta usada no 3D (em metros, vista de cima).
   Refeita em 11/11/2026 medindo as fotos de 10/11 (IMG 7676 a 7691), as fotos antigas de cada estante e a panorâmica.
   x vai da parede da porta (esquerda) para a parede dos cestos (direita); z vai da alvenaria (fundo) para a parede do ar.
   - fundo: a alvenaria branca H ocupa a parede inteira, em duas colunas (7682, 7684, 7685);
   - parede esquerda, do fundo para a porta: G com a cadeira na frente (7686, 7688), F (7687), depois dois móveis em que as
     letras são faixas de prateleira: no primeiro, D embaixo, E no meio e as fontes chaveadas de B em cima (foto B2); no
     segundo, as placas de A embaixo (fotos A2 a A5) e as fontes ATX de B em cima (foto B1). Depois as escadas e a porta
     dupla, que não aparece em nenhuma foto: é o único trecho de parede livre, e é de onde a panorâmica e as fotos 7677 a
     7679 foram tiradas;
   - meio: uma fileira só, de uma estante de fundo: C com os computadores (7682, 7691), uma estante sem letra (seladora azul
     e maleta de alumínio, 7681), a das placas e do domo branco (foto A1, conta como A) e a pilha embrulhada na ponta;
   - parede direita, do fundo para o ar: I (7682, 7683), J com fundo de tela (7680), a estante de tela das caixinhas com a
     CPU e as impressoras em cima, o vão aberto em cima e os cestos de cabos K até o canto (7677, 7678, 7679);
   - parede do ar: ar-condicionado no alto, os quatro fliperamas em pé lado a lado e a coluna de cestos escalonada (7678, 7690);
   - chão: não tem caixa de papelão solta no meio. Elas ficam empilhadas ao lado dos fliperamas, do lado da porta, sem ficar
     na frente dela (7690, confirmado pelo dono do estoque); a caixa embrulhada com uma caixa em cima fica encostada na pilha
     (7676, 7677, 7679).
   SHELVES são as letras (o que o sistema guarda em cada peça). UNITS são os móveis de verdade: x/z = canto, w = largura (x),
   d = profundidade (z), h = altura do tampo, lv = altura de cada prateleira, face = lado da frente (n/s/e/w),
   kind = metal | tela (metal com fundo de tela) | aberta | alvenaria | cestos, fill = o que aparece em cada prateleira
   (de baixo para cima), id = letra do móvel inteiro, bands = letras por faixa de prateleira [letra, da, até], roof = o que
   fica em cima do tampo, go = lado por onde se chega (quando não é o da frente). */
export const ROOM = { w: 3.9, l: 8.2, h: 2.9, door: { wall: 'w', z: 5.75, w: 1.6 } };
export const SHELVES = [
  { id: 'H', name: 'Alvenaria: caixas, telas e impressoras', c: '#EFEFEF', photos: 11 },
  { id: 'I', name: 'Contadoras de cédulas e moedas', c: '#DA1476', photos: 4 },
  { id: 'J', name: 'Garra e mecânica', c: '#C31634', photos: 8 },
  { id: 'B', name: 'Fontes de energia', c: '#E79C2A', photos: 2 },
  { id: 'K', name: 'Cestos de cabos', c: '#9d9daa', photos: 0 },
  { id: 'C', name: 'TI e computadores', c: '#6EF2FF', photos: 5 },
  { id: 'A', name: 'Placas e eletrônica', c: '#345AFA', photos: 5 },
  { id: 'D', name: 'Visores e câmeras', c: '#D94BFA', photos: 4 },
  { id: 'E', name: 'Pagamento: moedeiros e noteiros', c: '#9a5cff', photos: 2 },
  { id: 'G', name: 'Rede, DVR e estabilizadores', c: '#7f9bff', photos: 5 },
  { id: 'F', name: 'Iluminação e LED', c: '#FFFF3C', photos: 6 },
];
const LV4 = [.1, .46, .86, 1.26], LV5 = [.1, .46, .86, 1.26, 1.66];
export const UNITS = [
  { key: 'H', id: 'H', kind: 'alvenaria', x: 0, z: 0, w: 3.9, d: .46, h: 1.95, top: 2.42, face: 's' },
  // parede esquerda
  { key: 'G', id: 'G', kind: 'metal', x: 0, z: .56, w: .5, d: 1.4, h: 2.02, face: 'e', lv: LV4, fill: ['rede', 'rede', 'rede', 'redeTopo'], roof: 'paineis' },
  { key: 'F', id: 'F', kind: 'metal', x: 0, z: 1.98, w: .5, d: 1.05, h: 2.02, face: 'e', lv: LV4, fill: ['refletores', 'led', 'led', 'caixasAltas'], roof: 'bandeja' },
  { key: 'E3', kind: 'metal', x: 0, z: 3.05, w: .5, d: 1, h: 2.02, face: 'e', lv: LV4, fill: ['visores', 'visores', 'pagamento', 'chaveadas'], bands: [['D', 0, 1], ['E', 2, 2], ['B', 3, 3]], roof: 'caixaBaixa' },
  { key: 'E4', kind: 'metal', x: 0, z: 4.07, w: .5, d: .95, h: 2.02, face: 'e', lv: LV4, fill: ['chao', 'placas', 'placas', 'atx'], bands: [['A', 0, 2], ['B', 3, 3]], roof: 'caixaJca' },
  // fileira do meio
  { key: 'C', id: 'C', kind: 'metal', x: 1.6, z: 1.3, w: .55, d: 1.35, h: 2.02, face: 'e', lv: [.1, .56, 1.04, 1.52], fill: 'pcs', roof: 'caixasEmPe' },
  { key: 'M1', kind: 'metal', x: 1.6, z: 2.67, w: .55, d: 1.05, h: 2.02, face: 'e', lv: LV5, fill: 'diversos', roof: 'espuma' },
  { key: 'M2', id: 'A', kind: 'metal', x: 1.6, z: 3.74, w: .55, d: 1.15, h: 2.02, face: 'e', go: 'w', lv: LV5, fill: ['adaptadores', 'placas', 'placas', 'placas', 'diversos'], roof: 'paineisFita' },
  // parede direita
  { key: 'I', id: 'I', kind: 'metal', x: 3.4, z: .48, w: .5, d: 2.24, h: 2.02, face: 'w', bays: 2, lv: LV5, fill: ['contadoras', 'contadoras', 'estojos', 'contadoras', 'caixas'], roof: 'potes' },
  { key: 'J', id: 'J', kind: 'tela', x: 3.4, z: 2.74, w: .5, d: 2.46, h: 2.02, face: 'w', bays: 2, lv: LV5, fill: 'garra', roof: 'plastico' },
  { key: 'P', kind: 'tela', sides: true, x: 3.4, z: 5.22, w: .5, d: .78, h: 2.05, face: 'w', lv: LV4, fill: 'caixinhas', roof: 'impressoras' },
  { key: 'V', kind: 'aberta', x: 3.4, z: 6.02, w: .5, d: .93, h: 1.95, face: 'w', lv: [.1, .42, .78, 1], fill: ['caixas', 'aberta', 'aberta', 'bandeja'] },
  { key: 'K', id: 'K', kind: 'cestos', x: 3.45, z: 6.97, w: .45, d: 1.1, h: 1.72, face: 'w', cols: 2, rows: 6 },
  { key: 'K2', id: 'K', kind: 'cestos', x: 2.88, z: 7.75, w: .55, d: .45, h: 1.16, face: 'n', cols: 1, rows: 4, step: true },
];
/* Onde fica cada letra: uma ou mais caixas { x, z, w, d, y0, y1, face, kind }. A primeira é a principal (etiqueta, câmera e rota).
   Faixas iguais em móveis encostados (as fontes de B) viram uma caixa só. */
export const ZONES = {};
for (const u of UNITS) {
  const top = u.top || u.h + (u.roof ? .34 : .04);
  const add = (id, y0, y1, whole) => {
    const list = ZONES[id] ||= [], z = { x: u.x, z: u.z, w: u.w, d: u.d, y0, y1, face: u.go || u.face, kind: u.kind }, p = list[list.length - 1];
    if (p && p.x === z.x && p.w === z.w && p.y0 === y0 && p.y1 === y1 && Math.abs(p.z + p.d - z.z) < .05) return void (p.d = z.z + z.d - p.z);
    const i = list.findIndex(q => !q.whole); z.whole = whole;
    list.splice(whole && i >= 0 ? i : list.length, 0, z);                  // o móvel inteiro vem antes das faixas
  };
  if (u.id) add(u.id, 0, top, true);
  for (const [id, a, b] of u.bands || []) add(id, a ? u.lv[a] - .04 : 0, b + 1 < u.lv.length ? u.lv[b + 1] - .04 : top, false);
}
/* O que não é estante mas aparece nas fotos (também em metros). */
export const PROPS = {
  pilha: { x: 1.5, z: 4.93, w: .8, d: .78, h: 2.5 },                       // caixas embrulhadas em filme, na ponta da fileira do meio
  monte: { x: 1.45, z: 5.72, w: .68, d: .66, h: .42 },                     // uma das mesmas caixas no chão, encostada na pilha, com uma caixa de papelão em cima
  fliperamas: [.5, .8, 1.1, 1.4].map(x => ({ x, z: 6.98, w: .29, d: 1.2, h: .9 })),   // em pé, lado a lado, encostados na parede do ar
  escadas: { x: .05, z: 5.07, w: .35, d: .6 },                             // escada de degraus e escada articulada, entre a última estante e a porta
  cadeira: { x: .98, z: 1.25 },                                            // na frente da estante G
  ar: { x: 2.33, y: 2.52 },                                                // ar-condicionado no alto da parede do ar; o cano sai pelo canto dos cestos
  luzes: [[.95, 1.6], [2.95, 1.6], [.95, 4.1], [2.95, 4.1], [.95, 6.5], [2.95, 6.5]],
  caixas: { x: .04, z: 7.42, w: .42, d: .76 },                             // caixas de papelão empilhadas ao lado dos fliperamas, do lado da porta, sem ficar na frente dela
  soltas: [[1.25, .95]],                                                   // caixa no chão perto da cadeira
  caixotes: [[2.2, 7.18]],                                                 // caixote vermelho com cabos azuis no chão
  caixa001: [.78, .7],                                                     // caixa preta 001 no chão, na frente da alvenaria
};
/* Onde cada estante aparece na foto panorâmica (api/galpao/pano.jpg), em % da largura e da altura: [x, y, largura, altura].
   É só o ponto de partida: o administrador redesenha pelo botão Ajustar do Galpão, e o que ele salvar vale no lugar disto.
   A foto foi tirada da porta: à esquerda fica o móvel das fontes ATX (B) com as placas embaixo (A); no meio, a fileira do
   meio com a estante das placas (A) na frente e os computadores (C) no fundo; à direita, os cestos (K).
   D, E, F, G, I e J ficam fora do quadro ou atrás da pilha de caixas e da escada, por isso não estão marcadas. */
export const PANO_RATIO = 2365 / 978;
export const PANO = {
  B: [[0, 40, 11, 38]],
  A: [[0, 78, 11, 22], [25, 19, 11.5, 81]],
  H: [[11, 33, 3.7, 59]],
  C: [[14.7, 30, 4.6, 62]],
  K: [[85.5, 45, 14.5, 55]],
};
export const shelf = id => SHELVES.find(s => s.id === id);
export const shelfLabel = id => { const s = shelf(id); return s ? `Estante ${s.id} · ${s.name}` : 'Sem estante'; };
export const shelfOptions = cur => '<option value="">Sem estante</option>' + [...SHELVES].sort((a, b) => a.id.localeCompare(b.id))
  .map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.id} · ${s.name}</option>`).join('');
