import { renderIcons } from '../utils/icons.js';
import { escapeHTML } from '../utils/html.js';

/** HTML de un campo de formulario para usar dentro de un modal. */
export function campo({
  label, name, value = '', type = 'text', prefix = '', suffix = '', hint = '',
  placeholder = '', maxlength = '', textarea = false, numerico = false, required = false,
}) {
  const attrs = [
    `name="${name}"`,
    `placeholder="${escapeHTML(placeholder)}"`,
    'autocomplete="off"',
    maxlength ? `maxlength="${maxlength}"` : '',
    required ? 'required' : '',
    numerico ? 'inputmode="decimal"' : '',
  ].join(' ');

  const control = textarea
    ? `<textarea ${attrs} rows="3">${escapeHTML(value)}</textarea>`
    : `<input type="${type}" ${attrs} value="${escapeHTML(value)}">`;

  return `
    <label class="field">
      <span class="field__label">${label}${required ? ' *' : ''}</span>
      <span class="input-wrap">
        ${prefix ? `<span class="input-affix">${prefix}</span>` : ''}
        ${control}
        ${suffix ? `<span class="input-affix">${suffix}</span>` : ''}
      </span>
      ${hint ? `<span class="field__hint">${hint}</span>` : ''}
    </label>`;
}

/**
 * Abre un modal con formulario.
 * onSubmit(formData) puede ser async; si lanza un Error, se muestra su mensaje
 * y el modal queda abierto. Si termina bien, el modal se cierra.
 */
export function openModal({ title, icon = 'square', content, submitLabel = 'Aceptar', onSubmit }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.innerHTML = `
    <form class="modal__form" novalidate>
      <header class="modal__head">
        <h3 class="card__title"><span class="card__icon"><i data-lucide="${icon}"></i></span>${title}</h3>
        <button type="button" class="icon-btn" data-close aria-label="Cerrar"><i data-lucide="x"></i></button>
      </header>
      <div class="modal__body">${content}</div>
      <p class="modal__error" role="alert" hidden></p>
      <footer class="modal__foot">
        <button type="button" class="btn btn--soft" data-close>Cancelar</button>
        <button type="submit" class="btn btn--primary">
          <i data-lucide="check"></i><span>${submitLabel}</span>
        </button>
      </footer>
    </form>`;

  document.body.appendChild(dialog);
  renderIcons(dialog);

  const form = dialog.querySelector('form');
  const errorEl = dialog.querySelector('.modal__error');
  const submitBtn = dialog.querySelector('[type="submit"]');
  const submitText = submitBtn.querySelector('span');
  let enviando = false;

  const cerrar = () => { if (!enviando) dialog.close(); };

  dialog.addEventListener('close', () => dialog.remove());
  dialog.addEventListener('cancel', (e) => { if (enviando) e.preventDefault(); });
  dialog.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', cerrar));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) cerrar(); }); // clic en el fondo

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (enviando) return;
    enviando = true;
    errorEl.hidden = true;
    submitBtn.disabled = true;
    submitText.textContent = 'Guardando…';
    try {
      await onSubmit(new FormData(form));
      enviando = false;
      dialog.close();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
    } finally {
      enviando = false;
      submitBtn.disabled = false;
      submitText.textContent = submitLabel;
    }
  });

  dialog.showModal();
  dialog.querySelector('input, textarea')?.focus();
  return dialog;
}
