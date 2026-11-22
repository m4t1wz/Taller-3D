const MAPA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapa texto del usuario antes de insertarlo en HTML. */
export function escapeHTML(texto) {
  return String(texto ?? '').replace(/[&<>"']/g, (c) => MAPA[c]);
}
