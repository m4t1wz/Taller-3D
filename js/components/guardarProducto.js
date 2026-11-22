import { openModal } from './modal.js';
import { toast } from './toast.js';
import { crearProducto } from '../services/productos.js';
import { supabaseConfigurado } from '../services/supabase.js';
import { formatARS, redondear2 } from '../utils/format.js';

/** Abre el modal para guardar el cálculo actual como producto en venta. */
export function abrirGuardarProducto({ resultado, entradas }) {
  if (!supabaseConfigurado) {
    toast('Supabase no está configurado (ver SUPABASE_SETUP.md)', 'alert-circle', 4000);
    return;
  }
  if (!(resultado.totalCobrar > 0)) {
    toast('Completá los datos de la pieza antes de guardar', 'alert-circle');
    return;
  }

  openModal({
    title: 'Guardar como producto',
    icon: 'bookmark-plus',
    submitLabel: 'Guardar',
    content: `
      <div class="modal-summary">
        <div><span>Total a cobrar</span><strong>${formatARS(resultado.totalCobrar)}</strong></div>
        <div><span>Precio MercadoLibre</span><strong>${formatARS(resultado.precioML)}</strong></div>
      </div>
      <label class="field">
        <span class="field__label">Nombre *</span>
        <span class="input-wrap">
          <input type="text" name="nombre" maxlength="120" required autocomplete="off" placeholder="Ej: Llavero con logo">
        </span>
      </label>
      <label class="field">
        <span class="field__label">Descripción</span>
        <span class="input-wrap">
          <textarea name="descripcion" rows="3" maxlength="1000" placeholder="Material, color, medidas…"></textarea>
        </span>
      </label>`,

    async onSubmit(fd) {
      const nombre = String(fd.get('nombre') ?? '').trim();
      const descripcion = String(fd.get('descripcion') ?? '').trim();
      if (!nombre) throw new Error('Ingresá un nombre para el producto.');

      await crearProducto({
        nombre,
        descripcion: descripcion || null,
        precio_cobrar: redondear2(resultado.totalCobrar),
        precio_ml: redondear2(resultado.precioML),
        costo_total: redondear2(resultado.costoTotal),
        multiplicador: entradas.multiplicador,
        detalle: entradas,
      });

      toast(`"${nombre}" guardado en Productos`);
    },
  });
}
