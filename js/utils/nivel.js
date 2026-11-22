import { NIVEL_FILAMENTO } from '../config.js';

/** Porcentaje restante de un filamento y su nivel (mucho / mitad / poco). */
export function nivelFilamento(f) {
  const total = Number(f.gramos_totales);
  const actual = Number(f.gramos_actuales);
  const pct = total > 0 ? Math.max(0, Math.min(100, (actual / total) * 100)) : 0;

  if (pct > NIVEL_FILAMENTO.mucho) return { pct, clave: 'mucho', texto: 'Mucho' };
  if (pct >= NIVEL_FILAMENTO.poco) return { pct, clave: 'mitad', texto: 'Mitad' };
  return { pct, clave: 'poco', texto: 'Poco' };
}

export const colorSeguro = (c) => (/^#[0-9a-f]{6}$/i.test(String(c ?? '')) ? c : '#9dd3f1');
