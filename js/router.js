import { setActiveLink } from './components/sidebar.js';
import { renderIcons } from './utils/icons.js';

/**
 * Router por hash (#/ruta). Cada vista exporta { title, render(container) }.
 * render puede devolver una función de limpieza.
 * Devuelve { navigate, clear } para re-renderizar o vaciar la vista actual.
 */
export function createRouter(routes, fallback) {
  const container = document.getElementById('view');
  const titleEl = document.getElementById('pageTitle');
  let cleanup = null;
  let activo = true;

  function clear() {
    if (typeof cleanup === 'function') cleanup();
    cleanup = null;
    container.innerHTML = '';
  }

  function navigate() {
    if (!activo) return;
    const name = location.hash.replace(/^#\/?/, '') || fallback;
    const view = routes[name];
    if (!view) {
      location.hash = `#/${fallback}`;
      return;
    }

    clear();
    cleanup = view.render(container);

    titleEl.textContent = view.title;
    document.title = `${view.title} · Taller 3D`;
    setActiveLink(name);
    renderIcons(container);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', navigate);
  navigate();

  return {
    navigate() { activo = true; navigate(); },
    clear() { activo = false; clear(); },
  };
}
