/* Estantes do galpão e a planta usada no 3D (em metros, vista de cima).
   Remontada a partir das fotos de 10/11/2026: parede de alvenaria branca no fundo (norte), cestos pretos e o
   ar-condicionado no canto da porta (sudeste), pilha de caixas embrulhadas no corredor da direita e as fileiras
   de estantes pretas no meio. x vai da parede esquerda (oeste) para a direita; z vai do fundo (alvenaria) para a porta.
   Cada estante: x/z = canto de cima à esquerda, w = largura (x), d = profundidade (z), h = altura, lv = prateleiras,
   face = lado da frente (n/s/e/w), kind = metal | tela (metal com fundo de tela) | alvenaria | cestos,
   fill = o tipo de coisa que aparece nas prateleiras; photos = quantas fotos a estante tem em api/galpao/. */
export const ROOM = { w: 4.6, l: 7.6, h: 2.9, door: { x: 1.0, w: 1.0 } };
/* Uma fileira só no meio (I de um lado, J do outro), uma fileira em cada parede lateral e a alvenaria no fundo. */
export const SHELVES = [
  { id: 'H', name: 'Alvenaria: caixas, telas e impressoras', c: '#EFEFEF', photos: 11, x: 0.55, z: 0, w: 3.5, d: 0.46, h: 2.3, face: 's', kind: 'alvenaria', fill: 'alvenaria' },
  { id: 'A', name: 'Placas e eletrônica', c: '#345AFA', photos: 5, x: 4.12, z: 0.75, w: 0.48, d: 2.2, h: 2.05, lv: 5, face: 'w', kind: 'tela', fill: 'placas' },
  { id: 'B', name: 'Fontes de energia', c: '#E79C2A', photos: 2, x: 4.12, z: 2.95, w: 0.48, d: 1.7, h: 2.05, lv: 5, face: 'w', kind: 'tela', fill: 'fontes' },
  { id: 'K', name: 'Cestos de cabos', c: '#9d9daa', photos: 0, x: 4.04, z: 5.6, w: 0.56, d: 1.12, h: 1.75, face: 'w', kind: 'cestos', fill: 'cabos' },
  { id: 'I', name: 'Contadoras de cédulas e moedas', c: '#DA1476', photos: 4, x: 1.55, z: 0.95, w: 0.5, d: 3.6, h: 2.0, lv: 5, face: 'w', kind: 'metal', fill: 'contadoras' },
  { id: 'J', name: 'Garra e mecânica', c: '#C31634', photos: 8, x: 2.05, z: 0.95, w: 0.5, d: 3.6, h: 2.0, lv: 5, face: 'e', kind: 'metal', fill: 'garra' },
  { id: 'C', name: 'TI e computadores', c: '#6EF2FF', photos: 5, x: 0, z: 0.6, w: 0.5, d: 1.6, h: 2.05, lv: 5, face: 'e', kind: 'metal', fill: 'pcs' },
  { id: 'D', name: 'Visores e câmeras', c: '#D94BFA', photos: 4, x: 0, z: 2.2, w: 0.5, d: 1.2, h: 2.05, lv: 5, face: 'e', kind: 'metal', fill: 'visores' },
  { id: 'E', name: 'Pagamento: moedeiros e noteiros', c: '#9a5cff', photos: 2, x: 0, z: 3.4, w: 0.5, d: 1.1, h: 2.05, lv: 5, face: 'e', kind: 'metal', fill: 'pagamento' },
  { id: 'F', name: 'Iluminação e LED', c: '#FFFF3C', photos: 6, x: 0, z: 4.5, w: 0.5, d: 1.5, h: 2.05, lv: 5, face: 'e', kind: 'metal', fill: 'led' },
  { id: 'G', name: 'Rede, DVR e estabilizadores', c: '#7f9bff', photos: 5, x: 0, z: 6.0, w: 0.5, d: 1.4, h: 2.05, lv: 4, face: 'e', kind: 'metal', fill: 'rede' },
];
/* O que não é estante mas aparece nas fotos (também em metros). */
export const PROPS = {
  pilha: { x: 2.75, z: 4.7, w: 0.76, d: 0.76, h: 2.45 },                 // caixas embrulhadas em filme, na cabeça da fileira do meio
  moldura: { x: 4.12, z: 4.66, w: 0.48, d: 0.92, h: 2.05 },              // estante vazia, só a armação
  fliperamas: [{ x: 2.45, z: 5.95, w: 1.45, d: 0.56, h: 0.72 }, { x: 2.45, z: 6.6, w: 1.45, d: 0.56, h: 0.72 }],
  escada: { x: 2.55, z: 5.55 },
  cadeira: { x: 0.95, z: 6.4 },
  ar: { z: 6.1, y: 2.35 },                                               // ar-condicionado na parede direita (leste)
  luzes: [[1.1, 1.9], [3.3, 1.9], [1.1, 4.6], [3.3, 3.9], [2.0, 6.7]],
  soltas: [[3.5, 5.0], [1.2, 5.2], [3.0, 0.65]],                          // caixas no chão
  caixotes: [[1.6, 7.0], [2.2, 7.1]],                                     // caixotes pretos perto da porta
};
/* Onde cada estante aparece na foto panorâmica (api/galpao/pano.jpg), em % da largura e da altura: [x, y, largura, altura].
   É só o ponto de partida: o administrador redesenha pelo botão Ajustar do Galpão, e o que ele salvar vale no lugar disto.
   D, E, F e I ficam atrás da pilha de caixas e da escada nesta foto, por isso não estão marcadas. */
export const PANO_RATIO = 2365 / 978;
export const PANO = {
  B: [[0, 40, 11, 38]],
  A: [[0, 78, 11, 22]],
  H: [[11, 33, 4, 59], [15, 30, 4.5, 11]],
  G: [[15, 41, 10, 59]],
  J: [[25, 19, 11.5, 81]],
  C: [[69, 29, 16, 71]],
  K: [[85.5, 45, 14.5, 55]],
};
export const shelf = id => SHELVES.find(s => s.id === id);
export const shelfLabel = id => { const s = shelf(id); return s ? `Estante ${s.id} · ${s.name}` : 'Sem estante'; };
export const shelfOptions = cur => '<option value="">Sem estante</option>' + [...SHELVES].sort((a, b) => a.id.localeCompare(b.id))
  .map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.id} · ${s.name}</option>`).join('');
