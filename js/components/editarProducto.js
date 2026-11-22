import { openModal, campo } from './modal.js';
import { toast } from './toast.js';
import { actualizarProducto } from '../services/productos.js';
import { formatNumero, parseNumero, redondear2 } from '../utils/format.js';

/** Modal para editar nombre, descripción y precios de un producto. */
export function abrirEditarProducto(producto, onGuardado) {
  openModal({
    title: 'Editar producto',
    icon: 'pencil',
    submitLabel: 'Guardar cambios',
    content: `
      ${campo({ label: 'Nombre', name: 'nombre', value: producto.nombre, maxlength: 120, required: true })}
      ${campo({ label: 'Descripción', name: 'descripcion', value: producto.descripcion ?? '', maxlength: 1000, textarea: true })}
      <div class="form-grid">
        ${campo({ label: 'Total a cobrar', name: 'precio_cobrar', prefix: 'AR$', numerico: true, required: true,
                  value: formatNumero(Number(producto.precio_cobrar)) })}
        ${campo({ label: 'Precio MercadoLibre', name: 'precio_ml', prefix: 'AR$', numerico: true, required: true,
                  value: formatNumero(Number(producto.precio_ml)) })}
      </div>`,

    async onSubmit(fd) {
      const nombre = String(fd.get('nombre') ?? '').trim();
      const descripcion = String(fd.get('descripcion') ?? '').trim();
      const precioCobrar = parseNumero(fd.get('precio_cobrar'));
      const precioML = parseNumero(fd.get('precio_ml'));

      if (!nombre) throw new Error('Ingresá un nombre para el producto.');
      if (!(precioCobrar > 0) || !(precioML > 0)) throw new Error('Los precios deben ser mayores a 0.');

      const actualizado = await actualizarProducto(producto.id, {
        nombre,
        descripcion: descripcion || null,
        precio_cobrar: redondear2(precioCobrar),
        precio_ml: redondear2(precioML),
      });

      toast('Producto actualizado');
      onGuardado?.(actualizado);
    },
  });
}
