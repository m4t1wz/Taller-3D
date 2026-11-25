import { consultar, llamarFuncion } from './supabase.js';

const TABLA = 'impresiones';
const COLUMNAS = '*, filamento:filamentos(id, nombre, color)';

/**
 * Historial visible. Las "ignoradas" (marcas del historial previo al puente o
 * pendientes descartadas) solo sirven para no descontar dos veces: no se muestran.
 */
export const PAGINA_IMPRESIONES = 100;

export function listarImpresiones({ desde = 0, limite = PAGINA_IMPRESIONES } = {}) {
  return consultar(
    TABLA,
    (t) => t.select(COLUMNAS)
      .neq('estado', 'ignorada')
      .order('fecha', { ascending: false })
      .order('id', { ascending: false })
      .range(desde, desde + limite - 1),
    'cargar el historial',
  );
}

/** Impresiones del mes actual + todas las pendientes (para el Dashboard). */
export function impresionesParaResumen() {
  const inicioMes = new Date();
  inicioMes.setDate(1);
  inicioMes.setHours(0, 0, 0, 0);
  return consultar(
    TABLA,
    (t) => t.select('id, gramos, estado, fecha')
      .neq('estado', 'ignorada')
      .or(`fecha.gte.${inicioMes.toISOString()},estado.eq.pendiente`),
    'cargar las impresiones',
  );
}

export function asignarImpresion(impresionId, filamentoId) {
  return llamarFuncion(
    'asignar_impresion',
    { p_impresion_id: impresionId, p_filamento_id: filamentoId },
    'asignar la impresión',
  );
}

export function ignorarImpresion(id) {
  return consultar(TABLA, (t) => t.update({ estado: 'ignorada' }).eq('id', id).select().single(), 'ignorar la impresión');
}
