import { consultar } from './supabase.js';

const TABLA = 'productos';

export function listarProductos() {
  return consultar(TABLA, (t) => t.select('*').order('created_at', { ascending: false }), 'cargar los productos');
}

export function crearProducto(producto) {
  return consultar(TABLA, (t) => t.insert(producto).select().single(), 'guardar el producto');
}

export function actualizarProducto(id, cambios) {
  return consultar(TABLA, (t) => t.update(cambios).eq('id', id).select().single(), 'actualizar el producto');
}

export function eliminarProducto(id) {
  return consultar(TABLA, (t) => t.delete().eq('id', id), 'eliminar el producto');
}
