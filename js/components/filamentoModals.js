import { openModal, campo } from './modal.js';
import { toast } from './toast.js';
import { crearFilamento, actualizarFilamento, registrarImpresion } from '../services/filamentos.js';
import { asignarImpresion } from '../services/impresiones.js';
import { ROLLO_DEFAULT_G, DENSIDAD_DEFAULT } from '../config.js';
import { formatGramos, formatNumero, parseNumero, redondear2 } from '../utils/format.js';
import { escapeHTML } from '../utils/html.js';
import { colorSeguro } from '../utils/nivel.js';

const COLORES_RAPIDOS = [
  { hex: '#1f2328', nombre: 'Negro' },
  { hex: '#ffffff', nombre: 'Blanco' },
  { hex: '#9aa4ae', nombre: 'Gris' },
  { hex: '#e5484d', nombre: 'Rojo' },
  { hex: '#f76b15', nombre: 'Naranja' },
  { hex: '#ffd23f', nombre: 'Amarillo' },
  { hex: '#30a46c', nombre: 'Verde' },
  { hex: '#3e8ed0', nombre: 'Azul' },
  { hex: '#8e4ec6', nombre: 'Violeta' },
  { hex: '#f2a7c3', nombre: 'Rosa' },
];

export const esHexValido = (c) => /^#[0-9a-f]{6}$/i.test(String(c ?? ''));

function selectorColorHTML(valor) {
  return `
    <div class="field">
      <span class="field__label">Color *</span>
      <div class="color-picker">
        <label class="color-picker__main">
          <input type="color" name="color" value="${escapeHTML(valor)}" aria-label="Elegir color">
          <span class="color-picker__hex" data-hex>${escapeHTML(valor.toUpperCase())}</span>
        </label>
        <div class="color-picker__presets">
          ${COLORES_RAPIDOS.map((c) => `
            <button type="button" class="color-dot" data-color="${c.hex}" style="--dot:${c.hex}"
                    title="${c.nombre}" aria-label="${c.nombre}"></button>`).join('')}
        </div>
      </div>
    </div>`;
}

function conectarSelectorColor(dialog) {
  const input = dialog.querySelector('input[name="color"]');
  const hex = dialog.querySelector('[data-hex]');
  const sync = () => { hex.textContent = input.value.toUpperCase(); };
  input.addEventListener('input', sync);
  dialog.querySelectorAll('[data-color]').forEach((b) =>
    b.addEventListener('click', () => { input.value = b.dataset.color; sync(); }));
}

/** Modal para crear (filamento = null) o editar un filamento. */
export function abrirFormFilamento(filamento, onGuardado) {
  const editando = Boolean(filamento);
  const color = esHexValido(filamento?.color) ? filamento.color : '#9dd3f1';
  const total = filamento ? Number(filamento.gramos_totales) : ROLLO_DEFAULT_G;
  const actual = filamento ? Number(filamento.gramos_actuales) : ROLLO_DEFAULT_G;
  const densidad = filamento?.densidad != null ? Number(filamento.densidad) : DENSIDAD_DEFAULT;

  const dialog = openModal({
    title: editando ? 'Editar filamento' : 'Nuevo filamento',
    icon: editando ? 'pencil' : 'plus',
    submitLabel: editando ? 'Guardar cambios' : 'Agregar',
    content: `
      ${campo({ label: 'Nombre', name: 'nombre', value: filamento?.nombre ?? '', maxlength: 80, required: true,
                placeholder: 'Ej: PLA Grilon3 Celeste' })}
      ${selectorColorHTML(color)}
      <div class="form-grid">
        ${campo({ label: 'Peso del rollo', name: 'gramos_totales', suffix: 'g', numerico: true, required: true,
                  value: formatNumero(total), hint: 'Rollo lleno (normalmente 1000 g).' })}
        ${campo({ label: 'Gramos actuales', name: 'gramos_actuales', suffix: 'g', numerico: true, required: true,
                  value: formatNumero(actual), hint: 'Lo que le queda hoy.' })}
      </div>
      ${campo({ label: 'Densidad', name: 'densidad', suffix: 'g/cm³', numerico: true, required: true,
                value: formatNumero(densidad),
                hint: 'Para el descuento automático. PLA 1,24 · PETG 1,27 · ABS 1,04 · TPU 1,21.' })}`,

    async onSubmit(fd) {
      const nombre = String(fd.get('nombre') ?? '').trim();
      const colorElegido = String(fd.get('color') ?? '');
      const gramosTotales = parseNumero(fd.get('gramos_totales'));
      const gramosActuales = parseNumero(fd.get('gramos_actuales'));
      const dens = parseNumero(fd.get('densidad'));

      if (!nombre) throw new Error('Ingresá un nombre para el filamento.');
      if (!esHexValido(colorElegido)) throw new Error('Elegí un color válido.');
      if (!(gramosTotales > 0)) throw new Error('El peso del rollo debe ser mayor a 0.');
      if (gramosActuales < 0) throw new Error('Los gramos actuales no pueden ser negativos.');
      if (gramosActuales > gramosTotales) {
        throw new Error('Los gramos actuales no pueden superar el peso del rollo.');
      }
      if (!(dens >= 0.5 && dens <= 3)) throw new Error('La densidad tiene que estar entre 0,5 y 3 g/cm³.');

      const datos = {
        nombre,
        color: colorElegido.toLowerCase(),
        gramos_totales: redondear2(gramosTotales),
        gramos_actuales: redondear2(gramosActuales),
        densidad: redondear2(dens),
      };

      const guardado = editando
        ? await actualizarFilamento(filamento.id, datos)
        : await crearFilamento(datos);

      toast(editando ? 'Filamento actualizado' : `"${nombre}" agregado`);
      onGuardado?.(guardado);
    },
  });

  conectarSelectorColor(dialog);
}

/** Modal "Agregar impresión" (manual): descuenta gramos y lo anota en el historial. */
export function abrirRegistrarImpresion(filamento, onGuardado) {
  const disponible = Number(filamento.gramos_actuales);

  openModal({
    title: 'Agregar impresión',
    icon: 'printer',
    submitLabel: 'Descontar',
    content: `
      <div class="modal-summary">
        <div><span>Filamento</span><strong class="text-ellipsis">${escapeHTML(filamento.nombre)}</strong></div>
        <div><span>Disponible</span><strong>${formatGramos(disponible)}</strong></div>
      </div>
      ${campo({ label: 'Gramos a imprimir', name: 'gramos', suffix: 'g', numerico: true, required: true,
                placeholder: 'Ej: 49,2', hint: 'Los sacás del slicer o de la Calculadora 3D.' })}
      ${campo({ label: 'Pieza', name: 'archivo', maxlength: 120, placeholder: 'Opcional, ej: Llavero logo' })}`,

    async onSubmit(fd) {
      const gramos = parseNumero(fd.get('gramos'));
      const archivo = String(fd.get('archivo') ?? '').trim() || null;
      if (!(gramos > 0)) throw new Error('Ingresá cuántos gramos vas a imprimir.');
      if (gramos > disponible) {
        throw new Error(`No alcanza: quedan ${formatGramos(disponible)}. Si cambiaste el rollo, editá el filamento.`);
      }

      const actualizado = await registrarImpresion(filamento.id, redondear2(gramos), archivo);
      toast(`Descontados ${formatGramos(gramos)} · quedan ${formatGramos(actualizado.gramos_actuales)}`, 'printer');
      onGuardado?.(actualizado);
    },
  });
}

/** Modal para asignar una impresión pendiente (sin filamento activo) a un filamento. */
export function abrirAsignarImpresion(impresion, filamentos, onGuardado) {
  if (!filamentos.length) {
    toast('Primero cargá un filamento', 'alert-circle');
    return;
  }

  const opciones = filamentos.map((f, i) => `
    <label class="fil-option">
      <input type="radio" name="filamento" value="${escapeHTML(f.id)}" ${f.activo || i === 0 ? 'checked' : ''}>
      <span class="legend-swatch" style="--fil-color:${colorSeguro(f.color)}"></span>
      <span class="fil-option__name">${escapeHTML(f.nombre)}</span>
      <span class="fil-option__grams">${formatGramos(f.gramos_actuales)}</span>
    </label>`).join('');

  openModal({
    title: 'Asignar impresión',
    icon: 'link',
    submitLabel: 'Asignar y descontar',
    content: `
      <div class="modal-summary">
        <div><span>Pieza</span><strong class="text-ellipsis">${escapeHTML(impresion.archivo ?? 'Sin nombre')}</strong></div>
        <div><span>Consumo</span><strong>${formatNumero(Number(impresion.milimetros ?? 0))} mm</strong></div>
      </div>
      <div class="field">
        <span class="field__label">¿Con qué filamento se imprimió?</span>
        <div class="fil-options">${opciones}</div>
        <span class="field__hint">Los gramos se calculan con la densidad del filamento elegido.</span>
      </div>`,

    async onSubmit(fd) {
      const filamentoId = fd.get('filamento');
      if (!filamentoId) throw new Error('Elegí un filamento.');
      const actualizada = await asignarImpresion(impresion.id, filamentoId);
      toast(`Descontados ${formatGramos(actualizada.gramos)}`, 'printer');
      onGuardado?.(actualizada);
    },
  });
}
