import { listarProductos } from '../services/productos.js';
import { listarFilamentos } from '../services/filamentos.js';
import { supabaseConfigurado } from '../services/supabase.js';
import { abrirFormFilamento } from '../components/filamentoModals.js';
import { PERFIL_DEFAULT, NIVEL_FILAMENTO } from '../config.js';
import { cargar as cargarLocal } from '../utils/storage.js';
import { formatARS, formatFecha, formatGramos, formatPeso } from '../utils/format.js';
import { escapeHTML } from '../utils/html.js';
import { renderIcons } from '../utils/icons.js';
import { nivelFilamento, colorSeguro } from '../utils/nivel.js';

const MAX_RECIENTES = 5;

/* ---------- Bloques ---------- */

function statHTML(icono, valor, label, sub = '') {
  return `
    <article class="stat">
      <span class="stat__icon"><i data-lucide="${icono}"></i></span>
      <div class="stat__body">
        <strong class="stat__value">${valor}</strong>
        <span class="stat__label">${label}</span>
        ${sub ? `<span class="stat__sub">${sub}</span>` : ''}
      </div>
    </article>`;
}

function vacioHTML(texto, accion = '') {
  return `<div class="dash-empty"><p>${texto}</p>${accion}</div>`;
}

function errorHTML(err) {
  return `<div class="dash-empty dash-empty--error"><i data-lucide="cloud-off"></i><p>${escapeHTML(err.message)}</p></div>`;
}

function stockHTML(filamentos) {
  if (!filamentos.length) {
    return vacioHTML('Todavía no cargaste filamentos.',
      '<button type="button" class="btn btn--soft" data-nuevo-filamento><i data-lucide="plus"></i> Nuevo filamento</button>');
  }
  // Los más urgentes primero
  const ordenados = [...filamentos].sort((a, b) => nivelFilamento(a).pct - nivelFilamento(b).pct);
  return `
    <ul class="stock-list">
      ${ordenados.map((f) => {
        const { pct, clave, texto } = nivelFilamento(f);
        return `
          <li class="stock-item">
            <span class="spool spool--sm" style="--fil-color:${colorSeguro(f.color)}" aria-hidden="true"></span>
            <div class="stock-item__main">
              <div class="stock-item__top">
                <span class="stock-item__name">${escapeHTML(f.nombre)}</span>
                <span class="stock-item__grams">${formatGramos(f.gramos_actuales)}</span>
              </div>
              <div class="fil-bar fil-bar--sm" role="progressbar" aria-valuemin="0" aria-valuemax="100"
                   aria-valuenow="${Math.round(pct)}" aria-label="${escapeHTML(f.nombre)}: ${texto}">
                <span class="fil-bar__fill nivel-bg--${clave}" style="width:${pct}%"></span>
              </div>
            </div>
            <span class="nivel nivel--${clave}">${texto}</span>
          </li>`;
      }).join('')}
    </ul>`;
}

function alertasHTML(filamentos) {
  if (!filamentos.length) {
    return `<ul class="alerts"><li class="alert alert--info"><i data-lucide="info"></i>
      <span>Cargá tus filamentos para recibir alertas de stock.</span></li></ul>`;
  }

  const alertas = [];
  for (const f of filamentos) {
    const { pct, clave } = nivelFilamento(f);
    const nombre = `<b>${escapeHTML(f.nombre)}</b>`;
    if (Number(f.gramos_actuales) <= 0) {
      alertas.push({ orden: 0, tipo: 'poco', icono: 'circle-x', texto: `${nombre} está agotado.` });
    } else if (clave === 'poco') {
      alertas.push({ orden: 1, tipo: 'poco', icono: 'triangle-alert',
        texto: `${nombre} con poco stock: quedan ${formatGramos(f.gramos_actuales)} (${Math.round(pct)} %).` });
    } else if (clave === 'mitad') {
      alertas.push({ orden: 2, tipo: 'mitad', icono: 'circle-alert',
        texto: `${nombre} va por la mitad: ${formatGramos(f.gramos_actuales)}.` });
    }
  }

  if (!alertas.length) {
    return `<ul class="alerts"><li class="alert alert--ok"><i data-lucide="circle-check"></i>
      <span>Todo el stock está bien. No hay bobinas por agotarse.</span></li></ul>`;
  }

  alertas.sort((a, b) => a.orden - b.orden);
  return `<ul class="alerts">${alertas.map((a) => `
    <li class="alert alert--${a.tipo}"><i data-lucide="${a.icono}"></i><span>${a.texto}</span></li>`).join('')}</ul>`;
}

/** Barra apilada 100 %: cuánto aporta cada bobina al total disponible. */
function distribucionHTML(filamentos) {
  const conStock = filamentos.filter((f) => Number(f.gramos_actuales) > 0);
  const total = conStock.reduce((s, f) => s + Number(f.gramos_actuales), 0);
  if (!total) return vacioHTML('No hay filamento disponible para graficar.');

  const items = conStock
    .map((f) => ({ f, g: Number(f.gramos_actuales), pct: (Number(f.gramos_actuales) / total) * 100 }))
    .sort((a, b) => b.g - a.g);

  const pctTxt = (p) => (p < 1 ? '< 1' : Math.round(p));

  return `
    <div class="dist-bar" role="img" aria-label="Distribución del filamento disponible por bobina">
      ${items.map(({ f, g, pct }) => `
        <span class="dist-bar__seg" style="flex-grow:${g};--fil-color:${colorSeguro(f.color)}" tabindex="0"
              data-tip="${escapeHTML(f.nombre)} · ${formatGramos(g)} · ${pctTxt(pct)} %"></span>`).join('')}
    </div>
    <table class="dist-table">
      <thead><tr><th>Bobina</th><th>Disponible</th><th>% del total</th></tr></thead>
      <tbody>
        ${items.map(({ f, g, pct }) => `
          <tr>
            <td><span class="legend-swatch" style="--fil-color:${colorSeguro(f.color)}"></span>${escapeHTML(f.nombre)}</td>
            <td>${formatGramos(g)}</td>
            <td>${pctTxt(pct)} %</td>
          </tr>`).join('')}
      </tbody>
      <tfoot><tr><td>Total</td><td>${formatPeso(total)}</td><td>100 %</td></tr></tfoot>
    </table>`;
}

function recientesHTML(productos) {
  if (!productos.length) {
    return vacioHTML('Todavía no guardaste productos.',
      '<a href="#/calculadora" class="btn btn--soft"><i data-lucide="calculator"></i> Ir a la calculadora</a>');
  }
  return `
    <ul class="recent-list">
      ${productos.slice(0, MAX_RECIENTES).map((p) => `
        <li class="recent-item">
          <div class="recent-item__main">
            <span class="recent-item__name">${escapeHTML(p.nombre)}</span>
            <span class="recent-item__date">${formatFecha(p.created_at)}</span>
          </div>
          <div class="recent-item__prices">
            <strong>${formatARS(p.precio_cobrar)}</strong>
            <span>ML ${formatARS(p.precio_ml)}</span>
          </div>
        </li>`).join('')}
    </ul>
    ${productos.length > MAX_RECIENTES ? '<a href="#/productos" class="dash-link">Ver todos los productos <i data-lucide="arrow-right"></i></a>' : ''}`;
}

function panel(id, icono, titulo, extra = '') {
  return `
    <section class="card dash-panel" id="${id}">
      <div class="card__head">
        <h3 class="card__title"><span class="card__icon"><i data-lucide="${icono}"></i></span>${titulo}</h3>
        ${extra}
      </div>
      <div class="dash-panel__body" data-body><div class="loading"><i data-lucide="loader-circle"></i> Cargando…</div></div>
    </section>`;
}

/* ---------- Vista ---------- */

export default {
  title: 'Dashboard',

  render(container) {
    let activo = true;

    container.innerHTML = `
      <div class="page-header page-header--row">
        <div>
          <h2>Resumen general</h2>
          <p>Así está tu taller hoy.</p>
        </div>
        <div class="quick-actions">
          <a href="#/calculadora" class="btn btn--primary"><i data-lucide="calculator"></i> Abrir calculadora</a>
          <button type="button" class="btn btn--soft" data-nuevo-filamento><i data-lucide="disc-3"></i> Registrar filamento</button>
          <a href="#/productos" class="btn btn--soft"><i data-lucide="package"></i> Ver productos</a>
        </div>
      </div>

      <div class="stats" id="stats"></div>

      <div class="dash-grid">
        ${panel('pStock', 'disc-3', 'Inventario de filamentos', '<a href="#/filamentos" class="dash-link">Gestionar <i data-lucide="arrow-right"></i></a>')}
        ${panel('pAlertas', 'bell', 'Alertas')}
        ${panel('pDist', 'chart-bar-stacked', 'Distribución del inventario')}
        ${panel('pRecientes', 'clock', 'Productos recientes')}
      </div>`;

    const statsEl = container.querySelector('#stats');
    const body = (id) => container.querySelector(`#${id} [data-body]`);

    function pintar(el, html) {
      el.innerHTML = html;
      renderIcons(el);
    }

    function pintarStats(productos, filamentos) {
      const perfil = cargarLocal('perfil', PERFIL_DEFAULT);
      const gramos = filamentos ? filamentos.reduce((s, f) => s + Number(f.gramos_actuales), 0) : null;
      const valor = gramos != null ? (gramos / 1000) * perfil.precioFilamento : null;
      const pocos = filamentos ? filamentos.filter((f) => nivelFilamento(f).clave === 'poco').length : null;
      const guion = '—';

      pintar(statsEl, [
        statHTML('package', productos ? productos.length : guion, 'Productos registrados'),
        statHTML('weight', gramos != null ? formatPeso(gramos) : guion, 'Filamento disponible',
          filamentos ? `${filamentos.length} ${filamentos.length === 1 ? 'bobina' : 'bobinas'}` : ''),
        statHTML('wallet', valor != null ? formatARS(valor) : guion, 'Valor del filamento',
          `a ${formatARS(perfil.precioFilamento)}/kg (perfil)`),
        statHTML('triangle-alert', pocos ?? guion, 'Bobinas por agotarse',
          `menos del ${NIVEL_FILAMENTO.poco} % restante`),
      ].join(''));
    }

    async function cargarTodo() {
      if (!supabaseConfigurado) {
        pintarStats(null, null);
        const msg = vacioHTML('Supabase no está configurado. Seguí SUPABASE_SETUP.md.');
        ['pStock', 'pAlertas', 'pDist', 'pRecientes'].forEach((id) => pintar(body(id), msg));
        return;
      }

      const [rp, rf] = await Promise.allSettled([listarProductos(), listarFilamentos()]);
      if (!activo) return;

      const productos = rp.status === 'fulfilled' ? rp.value ?? [] : null;
      const filamentos = rf.status === 'fulfilled' ? rf.value ?? [] : null;

      pintarStats(productos, filamentos);

      if (filamentos) {
        pintar(body('pStock'), stockHTML(filamentos));
        pintar(body('pAlertas'), alertasHTML(filamentos));
        pintar(body('pDist'), distribucionHTML(filamentos));
      } else {
        ['pStock', 'pAlertas', 'pDist'].forEach((id) => pintar(body(id), errorHTML(rf.reason)));
      }
      pintar(body('pRecientes'), productos ? recientesHTML(productos) : errorHTML(rp.reason));
    }

    container.addEventListener('click', (e) => {
      if (e.target.closest('[data-nuevo-filamento]')) {
        abrirFormFilamento(null, () => { if (activo) cargarTodo(); });
      }
    });

    pintarStats(null, null);
    cargarTodo();

    return () => { activo = false; };
  },
};
