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

/**
 * Quita una impresión del historial.
 * - Manual: se borra.
 * - Automática: se oculta (estado "ignorada"); si se borrara, el puente la volvería a descontar.
 * `devolver` = sumar sus gramos de vuelta al filamento.
 */
export async function quitarImpresion(imp, { devolver = false } = {}) {
  if (imp.origen === 'auto') {
    await consultar(TABLA, (t) => t.update({ estado: 'ignorada' }).eq('id', imp.id), 'quitar la impresión');
  } else {
    await consultar(TABLA, (t) => t.delete().eq('id', imp.id), 'eliminar la impresión');
  }

  const gramos = Number(imp.gramos);
  if (devolver && imp.filamento_id && gramos > 0) {
    const fil = await consultar(
      'filamentos',
      (t) => t.select('gramos_actuales, gramos_totales').eq('id', imp.filamento_id).maybeSingle(),
      'leer el filamento',
    );
    if (fil) {
      const nuevo = Math.min(Number(fil.gramos_actuales) + gramos, Number(fil.gramos_totales));
      await consultar(
        'filamentos',
        (t) => t.update({ gramos_actuales: Math.round(nuevo * 100) / 100, updated_at: new Date().toISOString() })
          .eq('id', imp.filamento_id),
        'devolver los gramos al filamento',
      );
    }
  }
}

export function ignorarImpresion(id) {
  return consultar(TABLA, (t) => t.update({ estado: 'ignorada' }).eq('id', id).select().single(), 'ignorar la impresión');
}
