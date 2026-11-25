import { initSidebar } from './components/sidebar.js';
import { mostrarLogin } from './components/login.js';
import { toast } from './components/toast.js';
import { createRouter } from './router.js';
import { supabaseConfigurado } from './services/supabase.js';
import { obtenerSesion, cerrarSesion, alCambiarSesion } from './services/auth.js';
import { renderIcons } from './utils/icons.js';
import dashboard from './views/dashboard.js';
import calculadora from './views/calculadora.js';
import productos from './views/productos.js';
import filamentos from './views/filamentos.js';
import impresiones from './views/impresiones.js';

const ROUTES = { dashboard, calculadora, productos, filamentos, impresiones };

const appEl = document.getElementById('app');
const authEl = document.getElementById('auth');
const userBox = document.getElementById('sidebarUser');
const userEmail = document.getElementById('userEmail');

let router = null;
let estado = 'cargando'; // 'cargando' | 'login' | 'app'

function mostrarApp(sesion) {
  if (estado === 'app') return;
  estado = 'app';

  authEl.hidden = true;
  authEl.innerHTML = '';
  appEl.hidden = false;

  const email = sesion?.user?.email;
  userBox.hidden = !email;
  userEmail.textContent = email ?? '';

  if (router) router.navigate();
  else router = createRouter(ROUTES, 'dashboard');
}

function pedirLogin() {
  if (estado === 'login') return;
  estado = 'login';

  router?.clear();
  document.querySelectorAll('dialog.modal').forEach((d) => d.close());
  appEl.hidden = true;
  authEl.hidden = false;
  document.title = 'Iniciar sesión · Taller 3D';
  mostrarLogin(authEl, { onLogin: mostrarApp });
}

renderIcons();
initSidebar();

document.getElementById('btnLogout').addEventListener('click', async () => {
  try {
    await cerrarSesion();
  } catch {
    toast('No se pudo cerrar sesión en el servidor', 'alert-circle');
  }
  pedirLogin();
});

if (!supabaseConfigurado) {
  // Sin Supabase no hay login: la calculadora igual funciona.
  mostrarApp(null);
} else {
  try {
    const sesion = await obtenerSesion();
    if (sesion) mostrarApp(sesion);
    else pedirLogin();

    alCambiarSesion((evento, nueva) => {
      if (evento === 'SIGNED_OUT') pedirLogin();
      else if (evento === 'SIGNED_IN' && nueva) mostrarApp(nueva);
    });
  } catch (err) {
    pedirLogin();
    toast(err.message, 'alert-circle', 5000);
  }
}
