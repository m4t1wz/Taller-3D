import { initSidebar } from './components/sidebar.js';
import { createRouter } from './router.js';
import { renderIcons } from './utils/icons.js';
import dashboard from './views/dashboard.js';
import calculadora from './views/calculadora.js';
import productos from './views/productos.js';
import filamentos from './views/filamentos.js';

renderIcons();
initSidebar();
createRouter({ dashboard, calculadora, productos, filamentos }, 'dashboard');
