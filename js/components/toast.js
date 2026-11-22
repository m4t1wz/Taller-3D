import { renderIcons } from '../utils/icons.js';

export function toast(mensaje, icono = 'check-circle-2', duracion = 2600) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;

  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<i data-lucide="${icono}"></i><span></span>`;
  el.querySelector('span').textContent = mensaje;
  stack.appendChild(el);
  renderIcons(el);

  setTimeout(() => {
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  }, duracion);
}
