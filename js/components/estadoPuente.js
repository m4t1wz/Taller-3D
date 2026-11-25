import { escapeHTML } from '../utils/html.js';
import { haceTiempo, nombrePieza } from '../utils/format.js';

const SIN_SENAL_SEG = 3 * 60; // el puente late cada 1 min: 3 min sin latido = desconectado

/** HTML de la tarjeta "Estado del puente". */
export function estadoPuenteHTML(p) {
  if (!p || !p.ultimo_latido) {
    return `
      <div class="puente puente--off">
        <span class="puente__dot"></span>
        <div class="puente__info">
          <strong>Todavía no hay señal del puente</strong>
          <span>Arrancalo con <code>puente/iniciar-puente.vbs</code> en tu PC.</span>
        </div>
      </div>`;
  }

  const ahora = new Date(p.ahora ?? Date.now());
  const seg = (ahora - new Date(p.ultimo_latido)) / 1000;
  const sync = p.ultima_sync
    ? `<span class="puente__foot">Última sincronización: ${haceTiempo((ahora - new Date(p.ultima_sync)) / 1000)}</span>`
    : '';

  // PC apagada / puente detenido
  if (seg > SIN_SENAL_SEG) {
    return `
      <div class="puente puente--off">
        <span class="puente__dot"></span>
        <div class="puente__info">
          <strong>Desconectado · último contacto ${haceTiempo(seg)}</strong>
          <span>¿PC apagada? Las impresiones que hagas se descuentan solas cuando vuelva (hasta 50).</span>
          ${sync}
        </div>
      </div>`;
  }

  // Puente vivo pero no llega a la impresora
  if (p.impresora_estado === 'sin_conexion') {
    return `
      <div class="puente puente--warn">
        <span class="puente__dot"></span>
        <div class="puente__info">
          <strong>Puente activo · impresora sin conexión</strong>
          <span>¿Está apagada la impresora o cambió su IP?</span>
          ${sync}
        </div>
      </div>`;
  }

  const imprimiendo = p.impresora_estado === 'imprimiendo' || p.impresora_estado === 'pausada';
  const pct = Number.isFinite(p.impresora_progreso) ? p.impresora_progreso : null;
  const detalle = imprimiendo
    ? `${p.impresora_estado === 'pausada' ? 'En pausa' : 'Imprimiendo'}: <b>${escapeHTML(nombrePieza(p.impresora_archivo))}</b>${pct != null ? ` · ${pct} %` : ''}`
    : 'Impresora libre';

  return `
    <div class="puente puente--on">
      <span class="puente__dot"></span>
      <div class="puente__info">
        <strong>Conectado</strong>
        <span>${detalle}</span>
        ${imprimiendo && pct != null ? `
          <div class="fil-bar fil-bar--sm puente__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
            <span class="fil-bar__fill" style="width:${pct}%"></span>
          </div>` : ''}
        ${sync}
      </div>
    </div>`;
}
