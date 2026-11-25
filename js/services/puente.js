import { llamarFuncion } from './supabase.js';

/** Estado del puente (último latido, estado de la impresora). Solo con sesión. */
export async function obtenerEstadoPuente() {
  const filas = await llamarFuncion('estado_puente', {}, 'consultar el estado del puente');
  return filas?.[0] ?? null;
}
