import { consultar, llamarFuncion } from './supabase.js';

const TABLA = 'filamentos';

export function listarFilamentos() {
  return consultar(TABLA, (t) => t.select('*').order('created_at', { ascending: false }), 'cargar los filamentos');
}

export function crearFilamento(filamento) {
  return consultar(TABLA, (t) => t.insert(filamento).select().single(), 'guardar el filamento');
}

export function actualizarFilamento(id, cambios) {
  return consultar(
    TABLA,
    (t) => t.update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id).select().single(),
    'actualizar el filamento',
  );
}

export function eliminarFilamento(id) {
  return consultar(TABLA, (t) => t.delete().eq('id', id), 'eliminar el filamento');
}

/** Descuenta gramos de forma atómica en la base. Devuelve el filamento actualizado. */
export function registrarImpresion(id, gramos) {
  return llamarFuncion('registrar_impresion', { p_filamento_id: id, p_gramos: gramos }, 'registrar la impresión');
}
