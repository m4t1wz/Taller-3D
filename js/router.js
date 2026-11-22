import { setActiveLink } from './components/sidebar.js';
import { renderIcons } from './utils/icons.js';

/**
 * Router por hash (#/ruta). Cada vista exporta { title, render(container) }.
 * render puede devolver una función de limpieza.
 */
export function createRouter(routes, fallback) {
  const container = document.getElementById('view');
  const titleEl = document.getElementById('pageTitle');
  let cleanup = null;

  function navigate() {
    const name = location.hash.replace(/^#\/?/, '') || fallback;
    const view = routes[name];
    if (!view) {
      location.hash = `#/${fallback}`;
      return;
    }

    if (typeof cleanup === 'function') cleanup();
    container.innerHTML = '';
    cleanup = view.render(container);

    titleEl.textContent = view.title;
    document.title = `${view.title} · Taller 3D`;
    setActiveLink(name);
    renderIcons(container);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', navigate);
  navigate();
}
