import {
  PERFIL_DEFAULT,
  MULTIPLICADORES,
  REFERENCIAS_MULTIPLICADOR,
  MULTIPLICADOR_DEFAULT,
} from '../config.js';
import { calcularCostos } from '../calculadora/formulas.js';
import { formatARS, formatNumero, parseNumero } from '../utils/format.js';
import { cargar, guardar } from '../utils/storage.js';
import { toast } from '../components/toast.js';
import { abrirGuardarProducto } from '../components/guardarProducto.js';

/* ---------- Definición de campos ---------- */

const CAMPOS_PERFIL = [
  { id: 'precioFilamento', label: 'Precio del filamento', prefix: 'AR$', suffix: '/kg' },
  { id: 'precioKwh', label: 'Precio del kWh', prefix: 'AR$' },
  {
    id: 'consumoW', label: 'Consumo de la impresora', suffix: 'W', full: true,
    hint: 'Consumo promedio durante un print (no el pico). Si no lo sabés, ~100 W es un buen valor por defecto.',
  },
  { id: 'vidaUtil', label: 'Vida útil de la máquina', suffix: 'horas' },
  { id: 'costoRepuestos', label: 'Costo de repuestos', prefix: 'AR$' },
  { id: 'margenError', label: 'Margen de error', suffix: '%' },
];

const CAMPOS_ML = [
  {
    id: 'mlAdicional', label: 'Adicional al multiplicador', prefix: '+', full: true,
    hint: 'Precio ML = costo total × (multiplicador + adicional) + insumos.',
  },
];

const CAMPOS_PIEZA = [
  { id: 'horas', label: 'Horas de impresión', suffix: 'h', placeholder: '0', hint: 'En horas decimales (1,5 = 1 h 30 min).' },
  { id: 'minutos', label: 'Minutos adicionales', suffix: 'min', placeholder: '0' },
  { id: 'gramos', label: 'Gramos de filamento', suffix: 'g', placeholder: '0' },
  { id: 'insumos', label: 'Insumos extra', prefix: 'AR$', placeholder: '0', hint: 'Imanes, tornillos, pintura… (+30 %).' },
];

const RESULTADOS = [
  { id: 'material', label: 'Precio material' },
  { id: 'luz', label: 'Precio luz' },
  { id: 'desgaste', label: 'Desgaste máquina' },
  { id: 'margenError', label: 'Margen de error' },
  { id: 'costoTotal', label: 'Costo total (sin insumos)', subtotal: true },
  { id: 'insumos', label: 'Insumos (+30%)' },
];

/* ---------- Templates ---------- */

function campoHTML(c, valor = '') {
  return `
    <label class="field ${c.full ? 'field--full' : ''}">
      <span class="field__label">${c.label}</span>
      <span class="input-wrap">
        ${c.prefix ? `<span class="input-affix">${c.prefix}</span>` : ''}
        <input type="text" inputmode="decimal" autocomplete="off"
               name="${c.id}" value="${valor}" placeholder="${c.placeholder ?? ''}">
        ${c.suffix ? `<span class="input-affix">${c.suffix}</span>` : ''}
      </span>
      ${c.hint ? `<span class="field__hint">${c.hint}</span>` : ''}
    </label>`;
}

function cardHead(icono, titulo, extra = '') {
  return `
    <div class="card__head">
      <h3 class="card__title"><span class="card__icon"><i data-lucide="${icono}"></i></span>${titulo}</h3>
      ${extra}
    </div>`;
}

function template(perfil) {
  const v = (id) => formatNumero(perfil[id]);

  return `
    <div class="page-header">
      <h2>Calculadora 3D</h2>
      <p>Calculá el costo real de tus impresiones y el precio sugerido de venta.</p>
    </div>

    <div class="calc">
      <form class="calc__forms" id="calcForm" novalidate>

        <section class="card">
          ${cardHead('wallet', 'Gastos fijos', `
            <button type="button" class="btn btn--soft" id="btnGuardarPerfil">
              <i data-lucide="save"></i> Actualizar perfil
            </button>`)}
          <div class="form-grid">
            ${CAMPOS_PERFIL.map((c) => campoHTML(c, v(c.id))).join('')}
          </div>

          <details class="details">
            <summary><i data-lucide="store"></i> Ajustes de MercadoLibre <i data-lucide="chevron-down" class="chev"></i></summary>
            <div class="details__body">
              <div class="form-grid">
                ${CAMPOS_ML.map((c) => campoHTML(c, v(c.id))).join('')}
              </div>
            </div>
          </details>
        </section>

        <section class="card">
          ${cardHead('package', 'Pieza')}
          <div class="form-grid">
            ${CAMPOS_PIEZA.map((c) => campoHTML(c)).join('')}
          </div>
        </section>

        <section class="card">
          ${cardHead('trending-up', 'Margen de ganancia')}
          <div class="field">
            <span class="field__label">Multiplicador</span>
            <div class="chips" id="chips" role="group" aria-label="Multiplicador">
              ${MULTIPLICADORES.map((m) => `<button type="button" class="chip" data-mult="${m}">×${m}</button>`).join('')}
              <button type="button" class="chip" data-mult="custom">Personalizado</button>
            </div>
          </div>
          <div class="field" style="margin-top:14px">
            <span class="input-wrap">
              <span class="input-affix">×</span>
              <input type="text" inputmode="decimal" name="multiplicador" id="multInput"
                     value="${formatNumero(MULTIPLICADOR_DEFAULT)}" autocomplete="off">
            </span>
            <span class="field__hint">Si necesitás otro valor, ingresalo acá (ej: 2,8).</span>
          </div>

          <div class="references">
            <div class="references__title"><i data-lucide="info"></i> Referencias</div>
            <ul>
              ${REFERENCIAS_MULTIPLICADOR.map((r) => `<li><b>×${formatNumero(r.valor)}</b><span>${r.texto}</span></li>`).join('')}
            </ul>
          </div>
        </section>
      </form>

      <aside class="card results" aria-live="polite">
        <div class="results__head">
          ${cardHead('receipt', 'Resultados')}
        </div>
        <dl class="results__list">
          ${RESULTADOS.map((r) => `
            <div class="result-row ${r.subtotal ? 'result-row--subtotal' : ''}">
              <dt>${r.label}</dt><dd data-out="${r.id}">AR$ 0,00</dd>
            </div>`).join('')}
        </dl>
        <div class="results__totals">
          <div class="total-box">
            <span class="total-box__label"><i data-lucide="badge-dollar-sign"></i> Total a cobrar</span>
            <span class="total-box__value" data-out="totalCobrar">AR$ 0,00</span>
          </div>
          <div class="total-box total-box--ml">
            <span class="total-box__label"><i data-lucide="shopping-bag"></i> Precio MercadoLibre</span>
            <span class="total-box__value" data-out="precioML">AR$ 0,00</span>
            <span class="total-box__note" data-out="recargoML"></span>
          </div>
          <button type="button" class="btn btn--primary btn--block" id="btnGuardarProducto">
            <i data-lucide="bookmark-plus"></i> Guardar como producto
          </button>
        </div>
      </aside>
    </div>
  `;
}

/* ---------- Lógica de la vista ---------- */

const CLAVES_PERFIL = [...CAMPOS_PERFIL, ...CAMPOS_ML].map((c) => c.id);

export default {
  title: 'Calculadora 3D',

  render(container) {
    const perfil = cargar('perfil', PERFIL_DEFAULT);
    container.innerHTML = template(perfil);

    const form = container.querySelector('#calcForm');
    const multInput = container.querySelector('#multInput');
    const chips = container.querySelectorAll('.chip');
    const outputs = Object.fromEntries(
      [...container.querySelectorAll('[data-out]')].map((el) => [el.dataset.out, el]),
    );

    const leer = (name) => parseNumero(form.elements[name]?.value);

    function leerPerfil() {
      return Object.fromEntries(CLAVES_PERFIL.map((k) => [k, leer(k)]));
    }

    function actualizarChips() {
      const actual = leer('multiplicador');
      let coincide = false;
      chips.forEach((chip) => {
        const activo = chip.dataset.mult !== 'custom' && Number(chip.dataset.mult) === actual;
        if (activo) coincide = true;
        chip.classList.toggle('is-active', activo);
      });
      container.querySelector('[data-mult="custom"]').classList.toggle('is-active', !coincide);
    }

    let ultimo = null; // último cálculo, para "Guardar como producto"

    function recalcular() {
      const entradas = {
        ...leerPerfil(),
        horas: leer('horas'),
        minutos: leer('minutos'),
        gramos: leer('gramos'),
        insumos: leer('insumos'),
        multiplicador: leer('multiplicador'),
      };
      const r = calcularCostos(entradas);
      ultimo = { resultado: r, entradas };

      for (const key of [...RESULTADOS.map((x) => x.id), 'totalCobrar', 'precioML']) {
        outputs[key].textContent = formatARS(r[key]);
      }
      outputs.recargoML.textContent =
        `Multiplicador ×${formatNumero(Math.round(r.multiplicadorML * 100) / 100)} ` +
        `(+${formatNumero(Math.round(r.recargoML * 10) / 10)} %)`;
      actualizarChips();
    }

    form.addEventListener('input', recalcular);
    form.addEventListener('submit', (e) => e.preventDefault());

    container.querySelector('#chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      if (chip.dataset.mult === 'custom') {
        multInput.focus();
        multInput.select();
        return;
      }
      multInput.value = formatNumero(Number(chip.dataset.mult));
      recalcular();
    });

    container.querySelector('#btnGuardarPerfil').addEventListener('click', () => {
      const ok = guardar('perfil', leerPerfil());
      toast(ok ? 'Perfil actualizado' : 'No se pudo guardar el perfil', ok ? 'check-circle-2' : 'alert-circle');
    });

    container.querySelector('#btnGuardarProducto').addEventListener('click', () => {
      if (ultimo) abrirGuardarProducto(ultimo);
    });

    recalcular();
  },
};
