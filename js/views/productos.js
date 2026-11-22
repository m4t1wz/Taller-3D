import { listarProductos, eliminarProducto } from '../services/productos.js';
import { supabaseConfigurado } from '../services/supabase.js';
import { toast } from '../components/toast.js';
import { abrirEditarProducto } from '../components/editarProducto.js';
import { formatARS, formatFecha, formatNumero } from '../utils/format.js';
import { escapeHTML } from '../utils/html.js';
import { renderIcons } from '../utils/icons.js';

function estadoHTML(icono, titulo, texto, accion = '') {
  return `
    <section class="empty-state">
      <span class="empty-state__icon"><i data-lucide="${icono}"></i></span>
      <h3>${titulo}</h3>
      <p>${texto}</p>
      ${accion}
    </section>`;
}

function tarjetaHTML(p) {
  const desc = p.descripcion
    ? `<p class="product-card__desc">${escapeHTML(p.descripcion)}</p>`
    : '<p class="product-card__desc is-empty">Sin descripción</p>';

  const meta = [];
  if (p.costo_total != null) meta.push(`Costo ${formatARS(p.costo_total)}`);
  if (p.multiplicador != null) meta.push(`×${formatNumero(Number(p.multiplicador))}`);

  return `
    <article class="product-card">
      <header class="product-card__head">
        <h3>${escapeHTML(p.nombre)}</h3>
        <div class="card-actions">
          <button type="button" class="icon-btn" data-editar="${escapeHTML(p.id)}" aria-label="Editar ${escapeHTML(p.nombre)}">
            <i data-lucide="pencil"></i>
          </button>
          <button type="button" class="icon-btn icon-btn--danger" data-eliminar="${escapeHTML(p.id)}" aria-label="Eliminar ${escapeHTML(p.nombre)}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </header>
      ${desc}
      <div class="product-card__prices">
        <div class="price">
          <span>A cobrar</span>
          <strong>${formatARS(p.precio_cobrar)}</strong>
        </div>
        <div class="price price--ml">
          <span>MercadoLibre</span>
          <strong>${formatARS(p.precio_ml)}</strong>
        </div>
      </div>
      <footer class="product-card__meta">
        <span><i data-lucide="calendar"></i>${formatFecha(p.created_at)}</span>
        <span>${meta.join(' · ')}</span>
      </footer>
    </article>`;
}

export default {
  title: 'Productos',

  render(container) {
    let activo = true;
    let productos = [];

    container.innerHTML = `
      <div class="page-header page-header--row">
        <div>
          <h2>Productos en venta</h2>
          <p>Los productos que guardaste desde la Calculadora 3D.</p>
        </div>
        <a href="#/calculadora" class="btn btn--primary"><i data-lucide="plus"></i> Nuevo desde la calculadora</a>
      </div>

      <div class="toolbar">
        <label class="input-wrap toolbar__search">
          <span class="input-affix"><i data-lucide="search"></i></span>
          <input type="search" id="buscar" placeholder="Buscar por nombre o descripción" autocomplete="off" aria-label="Buscar productos">
        </label>
        <button type="button" class="icon-btn" id="recargar" aria-label="Recargar"><i data-lucide="refresh-cw"></i></button>
        <span class="toolbar__count" id="contador"></span>
      </div>

      <div id="lista"></div>`;

    const lista = container.querySelector('#lista');
    const buscar = container.querySelector('#buscar');
    const contador = container.querySelector('#contador');

    function pintar(html) {
      lista.innerHTML = html;
      renderIcons(lista);
    }

    function mostrar() {
      const q = buscar.value.trim().toLowerCase();
      const filtrados = q
        ? productos.filter((p) => `${p.nombre} ${p.descripcion ?? ''}`.toLowerCase().includes(q))
        : productos;

      contador.textContent = productos.length
        ? `${filtrados.length} de ${productos.length}`
        : '';

      if (!productos.length) {
        pintar(estadoHTML('package', 'Todavía no hay productos',
          'Calculá una pieza y usá "Guardar como producto" para que aparezca acá.',
          '<a href="#/calculadora" class="btn btn--primary"><i data-lucide="calculator"></i> Ir a la Calculadora 3D</a>'));
      } else if (!filtrados.length) {
        pintar(estadoHTML('search-x', 'Sin resultados', 'No hay productos que coincidan con la búsqueda.'));
      } else {
        pintar(`<div class="product-grid">${filtrados.map(tarjetaHTML).join('')}</div>`);
      }
    }

    async function cargar() {
      if (!supabaseConfigurado) {
        pintar(estadoHTML('plug-zap', 'Supabase no está configurado',
          'Seguí los pasos de SUPABASE_SETUP.md y completá js/supabase.config.js.'));
        return;
      }
      pintar('<div class="loading"><i data-lucide="loader-circle"></i> Cargando productos…</div>');
      try {
        const data = await listarProductos();
        if (!activo) return;
        productos = data ?? [];
        mostrar();
      } catch (err) {
        if (!activo) return;
        pintar(estadoHTML('cloud-off', 'No se pudieron cargar los productos', escapeHTML(err.message),
          '<button type="button" class="btn btn--soft" data-reintentar><i data-lucide="refresh-cw"></i> Reintentar</button>'));
      }
    }

    buscar.addEventListener('input', mostrar);
    container.querySelector('#recargar').addEventListener('click', cargar);

    lista.addEventListener('click', async (e) => {
      if (e.target.closest('[data-reintentar]')) { cargar(); return; }

      const btnEditar = e.target.closest('[data-editar]');
      if (btnEditar) {
        const producto = productos.find((p) => p.id === btnEditar.dataset.editar);
        if (producto) {
          abrirEditarProducto(producto, (actualizado) => {
            if (!activo) return;
            productos = productos.map((p) => (p.id === actualizado.id ? actualizado : p));
            mostrar();
          });
        }
        return;
      }

      const btn = e.target.closest('[data-eliminar]');
      if (!btn) return;
      const producto = productos.find((p) => p.id === btn.dataset.eliminar);
      if (!producto || !confirm(`¿Eliminar "${producto.nombre}"? No se puede deshacer.`)) return;

      btn.disabled = true;
      try {
        await eliminarProducto(producto.id);
        if (!activo) return;
        productos = productos.filter((p) => p.id !== producto.id);
        mostrar();
        toast('Producto eliminado', 'trash-2');
      } catch (err) {
        btn.disabled = false;
        toast(err.message, 'alert-circle', 4000);
      }
    });

    cargar();

    return () => { activo = false; };
  },
};
