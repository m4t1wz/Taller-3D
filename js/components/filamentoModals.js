import { openModal, campo } from './modal.js';
import { toast } from './toast.js';
import { crearFilamento, actualizarFilamento, registrarImpresion } from '../services/filamentos.js';
import { ROLLO_DEFAULT_G } from '../config.js';
import { formatGramos, formatNumero, parseNumero, redondear2 } from '../utils/format.js';
import { escapeHTML } from '../utils/html.js';

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
      </div>`,

    async onSubmit(fd) {
      const nombre = String(fd.get('nombre') ?? '').trim();
      const colorElegido = String(fd.get('color') ?? '');
      const gramosTotales = parseNumero(fd.get('gramos_totales'));
      const gramosActuales = parseNumero(fd.get('gramos_actuales'));

      if (!nombre) throw new Error('Ingresá un nombre para el filamento.');
      if (!esHexValido(colorElegido)) throw new Error('Elegí un color válido.');
      if (!(gramosTotales > 0)) throw new Error('El peso del rollo debe ser mayor a 0.');
      if (gramosActuales < 0) throw new Error('Los gramos actuales no pueden ser negativos.');
      if (gramosActuales > gramosTotales) {
        throw new Error('Los gramos actuales no pueden superar el peso del rollo.');
      }

      const datos = {
        nombre,
        color: colorElegido.toLowerCase(),
        gramos_totales: redondear2(gramosTotales),
        gramos_actuales: redondear2(gramosActuales),
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

/** Modal "Agregar impresión": descuenta gramos del filamento. */
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
                placeholder: 'Ej: 49,2', hint: 'Los sacás del slicer o de la Calculadora 3D.' })}`,

    async onSubmit(fd) {
      const gramos = parseNumero(fd.get('gramos'));
      if (!(gramos > 0)) throw new Error('Ingresá cuántos gramos vas a imprimir.');
      if (gramos > disponible) {
        throw new Error(`No alcanza: quedan ${formatGramos(disponible)}. Si cambiaste el rollo, editá el filamento.`);
      }

      const actualizado = await registrarImpresion(filamento.id, redondear2(gramos));
      toast(`Descontados ${formatGramos(gramos)} · quedan ${formatGramos(actualizado.gramos_actuales)}`, 'printer');
      onGuardado?.(actualizado);
    },
  });
}
