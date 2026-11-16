/* Fotos antigas (importadas por script) não têm miniatura, então o card do estoque baixava a foto
   original (1200x1600, centenas de KB) para mostrar em 211x158. Aqui, sem atrapalhar o uso, o navegador
   gera a miniatura de 480 px dessas fotos e envia uma única vez; depois todo mundo já recebe a leve. */
import { api, prepareImage } from './core.js';
import { state } from './state.js';

let running = false;
export function fixThumbs() {
  if (running || navigator.connection?.saveData) return;
  const todo = state.products.filter(p => p.needs_thumb && p.photo && p.photo_id);
  if (!todo.length) return;
  running = true;
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1));
  setTimeout(() => idle(async () => {
    const worker = async () => {
      for (let p; (p = todo.shift());) {
        try {
          const r = await fetch(p.photo); if (!r.ok) continue;
          const blob = await r.blob();
          const { thumb } = await prepareImage(new File([blob], 'foto.jpg', { type: blob.type || 'image/jpeg' }));
          if (!thumb) continue;
          const fd = new FormData(); fd.set('thumb', thumb, 'thumb.jpg');
          const d = await api(`/api/photos/${p.photo_id}/thumb`, { method: 'POST', body: fd });
          p.needs_thumb = false; if (d?.thumb) p.photo = d.thumb;
        } catch { /* tenta de novo na próxima vez que o site abrir */ }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    running = false;
  }), 2500);
}
