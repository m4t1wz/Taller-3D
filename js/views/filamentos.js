import { listarFilamentos, eliminarFilamento, activarFilamento } from '../services/filamentos.js';
import { supabaseConfigurado } from '../services/supabase.js';
import { abrirFormFilamento, abrirRegistrarImpresion, esHexValido } from '../components/filamentoModals.js';
import { toast } from '../components/toast.js';
import { NIVEL_FILAMENTO } from '../config.js';
import { formatGramos } from '../utils/format.js';
import { escapeHTML } from '../utils/html.js';
import { renderIcons } from '../utils/icons.js';
import { nivelFilamento } from '../utils/nivel.js';

function estadoHTML(icono, titulo, texto, accion = '') {
  return `
    <section class="empty-state">
      <span class="empty-state__icon"><i data-lucide="${icono}"></i></span>
      <h3>${titulo}</h3>
      <p>${texto}</p>
      ${accion}
    </section>`;
}

function tarjetaHTML(f) {
  const { pct, clave, texto } = nivelFilamento(f);
  const color = esHexValido(f.color) ? f.color : '#9dd3f1';
  const id = escapeHTML(f.id);
  const nombre = escapeHTML(f.nombre);
  const pctTexto = Math.round(pct);

  return `
    <article class="fil-card ${f.activo ? 'is-active' : ''}">
      <header class="fil-card__head">
        <span class="spool" style="--fil-color:${color}" aria-hidden="true"></span>
        <div class="fil-card__title">
          <h3>${nombre}</h3>
          <div class="fil-card__badges">
            <span class="nivel nivel--${clave}">${texto}</span>
            ${f.activo ? '<span class="badge-activo"><i data-lucide="zap"></i>Activo</span>' : ''}
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="icon-btn" data-editar="${id}" aria-label="Editar ${nombre}"><i data-lucide="pencil"></i></button>
          <button type="button" class="icon-btn icon-btn--danger" data-eliminar="${id}" aria-label="Eliminar ${nombre}"><i data-lucide="trash-2"></i></button>
        </div>
      </header>

      <div class="fil-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pctTexto}"
           aria-label="Filamento restante">
        <span class="fil-bar__fill nivel-bg--${clave}" style="width:${pct}%"></span>
      </div>

      <div class="fil-card__stats">
        <strong>${formatGramos(f.gramos_actuales)}</strong>
        <span>de ${formatGramos(f.gramos_totales)} · ${pctTexto} %</span>
      </div>

      <div class="fil-card__actions">
        <button type="button" class="btn btn--primary" data-imprimir="${id}"
                ${Number(f.gramos_actuales) <= 0 ? 'disabled' : ''}>
          <i data-lucide="printer"></i> Agregar impresión
        </button>
        ${f.activo
          ? '<span class="fil-card__active-note">Las impresiones automáticas se descuentan de acá</span>'
          : `<button type="button" class="btn btn--soft" data-activar="${id}"><i data-lucide="zap"></i> Usar como activo</button>`}
      </div>
    </article>`;
}

export default {
  title: 'Filamentos',

  render(container) {
    let activo = true;
    let filamentos = [];

    container.innerHTML = `
      <div class="page-header page-header--row">
        <div>
          <h2>Filamentos</h2>
          <p>Controlá cuánto filamento te queda en cada rollo.</p>
        </div>
        <button type="button" class="btn btn--primary" id="nuevoFilamento"><i data-lucide="plus"></i> Nuevo filamento</button>
      </div>

      <div class="toolbar">
        <div class="legend">
          <span><i class="legend__dot nivel-bg--mucho"></i>Mucho (&gt; ${NIVEL_FILAMENTO.mucho} %)</span>
          <span><i class="legend__dot nivel-bg--mitad"></i>Mitad</span>
          <span><i class="legend__dot nivel-bg--poco"></i>Poco (&lt; ${NIVEL_FILAMENTO.poco} %)</span>
        </div>
        <button type="button" class="icon-btn" id="recargar" aria-label="Recargar"><i data-lucide="refresh-cw"></i></button>
      </div>

      <div id="lista"></div>`;

    const lista = container.querySelector('#lista');

    function pintar(html) {
      lista.innerHTML = html;
      renderIcons(lista);
    }

    function mostrar() {
      if (!filamentos.length) {
        pintar(estadoHTML('disc-3', 'Todavía no cargaste filamentos',
          'Agregá tus rollos para llevar la cuenta de cuánto te queda de cada uno.',
          '<button type="button" class="btn btn--primary" data-nuevo><i data-lucide="plus"></i> Nuevo filamento</button>'));
        return;
      }
      // El activo siempre primero
      const ordenados = [...filamentos].sort((a, b) => Number(b.activo) - Number(a.activo));
      pintar(`<div class="fil-grid">${ordenados.map(tarjetaHTML).join('')}</div>`);
    }

    function reemplazar(actualizado) {
      if (!activo) return;
      const existe = filamentos.some((f) => f.id === actualizado.id);
      filamentos = existe
        ? filamentos.map((f) => (f.id === actualizado.id ? actualizado : f))
        : [actualizado, ...filamentos];
      mostrar();
    }

    async function cargar() {
      if (!supabaseConfigurado) {
        pintar(estadoHTML('plug-zap', 'Supabase no está configurado',
          'Seguí los pasos de SUPABASE_SETUP.md y completá js/supabase.config.js.'));
        return;
      }
      pintar('<div class="loading"><i data-lucide="loader-circle"></i> Cargando filamentos…</div>');
      try {
        const data = await listarFilamentos();
        if (!activo) return;
        filamentos = data ?? [];
        mostrar();
      } catch (err) {
        if (!activo) return;
        pintar(estadoHTML('cloud-off', 'No se pudieron cargar los filamentos', escapeHTML(err.message),
          '<button type="button" class="btn btn--soft" data-reintentar><i data-lucide="refresh-cw"></i> Reintentar</button>'));
      }
    }

    const nuevo = () => abrirFormFilamento(null, reemplazar);
    container.querySelector('#nuevoFilamento').addEventListener('click', nuevo);
    container.querySelector('#recargar').addEventListener('click', cargar);

    lista.addEventListener('click', async (e) => {
      if (e.target.closest('[data-reintentar]')) { cargar(); return; }
      if (e.target.closest('[data-nuevo]')) { nuevo(); return; }

      const btn = e.target.closest('[data-imprimir], [data-editar], [data-eliminar], [data-activar]');
      if (!btn) return;
      const id = btn.dataset.imprimir ?? btn.dataset.editar ?? btn.dataset.eliminar ?? btn.dataset.activar;
      const filamento = filamentos.find((f) => f.id === id);
      if (!filamento) return;

      if (btn.dataset.imprimir) { abrirRegistrarImpresion(filamento, reemplazar); return; }
      if (btn.dataset.editar) { abrirFormFilamento(filamento, reemplazar); return; }

      if (btn.dataset.activar) {
        btn.disabled = true;
        try {
          await activarFilamento(filamento.id);
          if (!activo) return;
          filamentos = filamentos.map((f) => ({ ...f, activo: f.id === filamento.id }));
          mostrar();
          toast(`"${filamento.nombre}" es el filamento activo`, 'zap');
        } catch (err) {
          btn.disabled = false;
          toast(err.message, 'alert-circle', 4000);
        }
        return;
      }

      if (!confirm(`¿Eliminar "${filamento.nombre}"? No se puede deshacer.`)) return;
      btn.disabled = true;
      try {
        await eliminarFilamento(filamento.id);
        if (!activo) return;
        filamentos = filamentos.filter((f) => f.id !== filamento.id);
        mostrar();
        toast('Filamento eliminado', 'trash-2');
      } catch (err) {
        btn.disabled = false;
        toast(err.message, 'alert-circle', 4000);
      }
    });

    cargar();

    return () => { activo = false; };
  },
};
