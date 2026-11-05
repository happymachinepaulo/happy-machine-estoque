/* Estantes do galpão (planta vista de cima, viewBox 1000×640, porta embaixo).
   Montada a partir das fotos de 05/11/2026. Para ajustar a planta, mude x/y/w/h aqui.
   face = lado da frente da estante (n/s/l=e/o=w), hgt = altura no 3D; photos = quantas fotos a estante tem em api/galpao/ (A1.jpg, A2.jpg… e miniaturas tA1.jpg…). */
export const SHELVES = [
  { id: 'H', name: 'Alvenaria: caixas, telas e impressoras', c: '#EFEFEF', x: 150, y: 28, w: 700, h: 62, photos: 11, face: 's', hgt: 175 },
  { id: 'A', name: 'Placas e eletrônica', c: '#345AFA', x: 28, y: 120, w: 74, h: 200, photos: 5, face: 'e', hgt: 150 },
  { id: 'B', name: 'Fontes de energia', c: '#E79C2A', x: 28, y: 332, w: 74, h: 136, photos: 2, face: 'e', hgt: 150 },
  { id: 'K', name: 'Cestos de cabos', c: '#9d9daa', x: 28, y: 482, w: 132, h: 112, photos: 2, face: 'e', hgt: 115 },
  { id: 'J', name: 'Garra e mecânica', c: '#C31634', x: 290, y: 168, w: 84, h: 290, photos: 8, face: 'w', hgt: 130 },
  { id: 'I', name: 'Contadoras de cédulas e moedas', c: '#DA1476', x: 374, y: 168, w: 84, h: 290, photos: 4, face: 'e', hgt: 130 },
  { id: 'F', name: 'Iluminação e LED', c: '#FFFF3C', x: 572, y: 168, w: 84, h: 290, photos: 6, face: 'w', hgt: 130 },
  { id: 'C', name: 'TI e computadores', c: '#6EF2FF', x: 898, y: 120, w: 74, h: 132, photos: 5, face: 'w', hgt: 150 },
  { id: 'D', name: 'Visores e câmeras', c: '#D94BFA', x: 898, y: 264, w: 74, h: 100, photos: 4, face: 'w', hgt: 150 },
  { id: 'E', name: 'Pagamento: moedeiros e noteiros', c: '#9a5cff', x: 898, y: 376, w: 74, h: 92, photos: 2, face: 'w', hgt: 150 },
  { id: 'G', name: 'Rede, DVR e estabilizadores', c: '#7f9bff', x: 898, y: 480, w: 74, h: 114, photos: 5, face: 'w', hgt: 150 },
];
export const shelf = id => SHELVES.find(s => s.id === id);
export const shelfLabel = id => { const s = shelf(id); return s ? `Estante ${s.id} · ${s.name}` : 'Sem estante'; };
export const shelfOptions = cur => '<option value="">Sem estante</option>' + [...SHELVES].sort((a, b) => a.id.localeCompare(b.id))
  .map(s => `<option value="${s.id}"${s.id === cur ? ' selected' : ''}>${s.id} · ${s.name}</option>`).join('');
