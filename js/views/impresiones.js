import { listarImpresiones, ignorarImpresion } from '../services/impresiones.js';
import { listarFilamentos } from '../services/filamentos.js';
import { supabaseConfigurado } from '../services/supabase.js';
import { abrirAsignarImpresion } from '../components/filamentoModals.js';
import { toast } from '../components/toast.js';
import { formatGramos, nombrePieza } from '../utils/format.js';
import { escapeHTML } from '../utils/html.js';
import { renderIcons } from '../utils/icons.js';
import { colorSeguro } from '../utils/nivel.js';

const FILTROS = [
  { id: 'todas', label: 'Todas' },
  { id: 'pendiente', label: 'Pendientes' },
  { id: 'auto', label: 'Automáticas' },
  { id: 'manual', label: 'Manuales' },
];

const fechaHora = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const duracion = (s) => {
  if (!s) return '';
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

function filaHTML(imp) {
  const fil = imp.filamento;
  const pendiente = imp.estado === 'pendiente';

  const filamento = fil
    ? `<span class="imp-fil"><span class="legend-swatch" style="--fil-color:${colorSeguro(fil.color)}"></span>${escapeHTML(fil.nombre)}</span>`
    : `<span class="imp-fil imp-fil--none">${pendiente ? 'Sin asignar' : '—'}</span>`;

  const origen = imp.origen === 'auto'
    ? '<span class="tag tag--auto"><i data-lucide="zap"></i>Automática</span>'
    : '<span class="tag tag--manual"><i data-lucide="hand"></i>Manual</span>';

  const extra = [];
  if (imp.terminada === false) extra.push('<span class="tag tag--warn"><i data-lucide="circle-x"></i>Cancelada</span>');
  if (pendiente) extra.push('<span class="tag tag--pend"><i data-lucide="clock"></i>Pendiente</span>');

  const acciones = pendiente
    ? `<div class="imp-actions">
         <button type="button" class="btn btn--primary btn--sm" data-asignar="${escapeHTML(imp.id)}"><i data-lucide="link"></i> Asignar</button>
         <button type="button" class="btn btn--soft btn--sm" data-ignorar="${escapeHTML(imp.id)}">Ignorar</button>
       </div>`
    : '';

  return `
    <li class="imp-row ${pendiente ? 'is-pending' : ''}">
      <div class="imp-main">
        <span class="imp-name" title="${escapeHTML(imp.archivo ?? '')}">${escapeHTML(nombrePieza(imp.archivo))}</span>
        <span class="imp-meta">
          ${fechaHora(imp.fecha)}${imp.duracion_s ? ` · ${duracion(imp.duracion_s)}` : ''}
        </span>
        <div class="imp-tags">${origen}${extra.join('')}</div>
      </div>
      <div class="imp-side">
        <strong class="imp-grams">${formatGramos(imp.gramos)}</strong>
        ${filamento}
      </div>
      ${acciones}
    </li>`;
}

export default {
  title: 'Impresiones',

  render(container) {
    let vivo = true;
    let impresiones = [];
    let filamentos = [];
    let filtro = 'todas';

    container.innerHTML = `
      <div class="page-header page-header--row">
        <div>
          <h2>Historial de impresiones</h2>
          <p>Lo que descontó el puente automáticamente y lo que cargaste a mano.</p>
        </div>
      </div>

      <div class="toolbar">
        <div class="chips" id="filtros" role="group" aria-label="Filtrar">
          ${FILTROS.map((f) => `<button type="button" class="chip ${f.id === filtro ? 'is-active' : ''}" data-filtro="${f.id}">${f.label}</button>`).join('')}
        </div>
        <button type="button" class="icon-btn" id="recargar" aria-label="Recargar"><i data-lucide="refresh-cw"></i></button>
      </div>

      <div id="lista"></div>`;

    const lista = container.querySelector('#lista');

    function pintar(html) {
      lista.innerHTML = html;
      renderIcons(lista);
    }

    function vacio(icono, titulo, texto) {
      return `<section class="empty-state">
        <span class="empty-state__icon"><i data-lucide="${icono}"></i></span>
        <h3>${titulo}</h3><p>${texto}</p></section>`;
    }

    function mostrar() {
      const filtradas = impresiones.filter((i) => {
        if (filtro === 'pendiente') return i.estado === 'pendiente';
        if (filtro === 'auto' || filtro === 'manual') return i.origen === filtro;
        return true;
      });

      if (!impresiones.length) {
        pintar(vacio('history', 'Todavía no hay impresiones',
          'Cuando uses "Agregar impresión" o el puente descuente una impresión, aparece acá.'));
      } else if (!filtradas.length) {
        pintar(vacio('search-x', 'Nada por acá', 'No hay impresiones con este filtro.'));
      } else {
        const total = filtradas.filter((i) => i.estado === 'descontada').reduce((s, i) => s + Number(i.gramos), 0);
        pintar(`
          <p class="imp-summary">${filtradas.length} ${filtradas.length === 1 ? 'impresión' : 'impresiones'} · ${formatGramos(total)} descontados</p>
          <ul class="imp-list">${filtradas.map(filaHTML).join('')}</ul>`);
      }
    }

    async function cargar() {
      if (!supabaseConfigurado) {
        pintar(vacio('plug-zap', 'Supabase no está configurado', 'Seguí los pasos de SUPABASE_SETUP.md.'));
        return;
      }
      pintar('<div class="loading"><i data-lucide="loader-circle"></i> Cargando historial…</div>');
      try {
        const [imps, fils] = await Promise.all([
          listarImpresiones(),
          listarFilamentos(),
        ]);
        if (!vivo) return;
        impresiones = imps ?? [];
        filamentos = fils ?? [];
        mostrar();
      } catch (err) {
        if (!vivo) return;
        pintar(vacio('cloud-off', 'No se pudo cargar el historial', escapeHTML(err.message)));
      }
    }

    container.querySelector('#filtros').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-filtro]');
      if (!chip) return;
      filtro = chip.dataset.filtro;
      container.querySelectorAll('[data-filtro]').forEach((c) => c.classList.toggle('is-active', c === chip));
      mostrar();
    });

    container.querySelector('#recargar').addEventListener('click', cargar);

    lista.addEventListener('click', async (e) => {
      const btnAsignar = e.target.closest('[data-asignar]');
      if (btnAsignar) {
        const imp = impresiones.find((i) => i.id === btnAsignar.dataset.asignar);
        if (imp) abrirAsignarImpresion(imp, filamentos, () => { if (vivo) cargar(); });
        return;
      }

      const btnIgnorar = e.target.closest('[data-ignorar]');
      if (btnIgnorar) {
        if (!confirm('¿Ignorar esta impresión? No se va a descontar de ningún filamento.')) return;
        btnIgnorar.disabled = true;
        try {
          await ignorarImpresion(btnIgnorar.dataset.ignorar);
          if (!vivo) return;
          toast('Impresión ignorada');
          cargar();
        } catch (err) {
          btnIgnorar.disabled = false;
          toast(err.message, 'alert-circle', 4000);
        }
      }
    });

    cargar();

    return () => { vivo = false; };
  },
};
