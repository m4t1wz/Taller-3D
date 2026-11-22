const MOBILE_QUERY = window.matchMedia('(max-width: 900px)');

/** Menú hamburguesa: off-canvas en mobile, colapsable en desktop. */
export function initSidebar() {
  const body = document.body;
  const toggle = document.getElementById('menuToggle');
  const overlay = document.getElementById('overlay');
  const sidebar = document.getElementById('sidebar');

  const isMobile = () => MOBILE_QUERY.matches;

  function setOpen(open) {
    if (isMobile()) {
      body.classList.toggle('sidebar-open', open);
      overlay.hidden = !open;
    } else {
      body.classList.toggle('sidebar-collapsed', !open);
    }
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }

  function isOpen() {
    return isMobile()
      ? body.classList.contains('sidebar-open')
      : !body.classList.contains('sidebar-collapsed');
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  overlay.addEventListener('click', () => setOpen(false));

  // En mobile, cerrar al elegir una sección.
  sidebar.addEventListener('click', (e) => {
    if (e.target.closest('.nav-link') && isMobile()) setOpen(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMobile() && isOpen()) setOpen(false);
  });

  // Al cambiar de tamaño, limpiar el estado del otro modo.
  MOBILE_QUERY.addEventListener('change', () => {
    body.classList.remove('sidebar-open', 'sidebar-collapsed');
    overlay.hidden = true;
    toggle.setAttribute('aria-expanded', String(!isMobile()));
  });

  toggle.setAttribute('aria-expanded', String(!isMobile()));
}

export function setActiveLink(route) {
  document.querySelectorAll('.nav-link').forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}
