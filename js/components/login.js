import { iniciarSesion } from '../services/auth.js';
import { renderIcons } from '../utils/icons.js';

/** Pinta la pantalla de login dentro de `root`. onLogin(sesion) se llama al entrar. */
export function mostrarLogin(root, { onLogin }) {
  root.innerHTML = `
    <div class="auth-card">
      <div class="auth-brand">
        <span class="brand-logo"><i data-lucide="box"></i></span>
        <span class="brand-name">Taller <strong>3D</strong></span>
      </div>
      <h2>Iniciar sesión</h2>
      <p class="auth-sub">Ingresá para ver tu taller.</p>

      <form class="auth-form" id="loginForm" novalidate>
        <label class="field">
          <span class="field__label">Email</span>
          <span class="input-wrap">
            <span class="input-affix"><i data-lucide="mail"></i></span>
            <input type="email" name="email" autocomplete="username" required>
          </span>
        </label>

        <label class="field">
          <span class="field__label">Contraseña</span>
          <span class="input-wrap">
            <span class="input-affix"><i data-lucide="lock"></i></span>
            <input type="password" name="password" autocomplete="current-password" required>
            <button type="button" class="input-btn" id="verPassword" aria-label="Mostrar contraseña">
              <i data-lucide="eye"></i>
            </button>
          </span>
        </label>

        <p class="auth-error" role="alert" hidden></p>

        <button type="submit" class="btn btn--primary btn--block">
          <i data-lucide="log-in"></i><span>Ingresar</span>
        </button>
      </form>
    </div>`;

  renderIcons(root);

  const form = root.querySelector('#loginForm');
  const errorEl = root.querySelector('.auth-error');
  const submit = form.querySelector('[type="submit"]');
  const submitText = submit.querySelector('span');
  const password = form.elements.password;
  const ver = root.querySelector('#verPassword');

  ver.addEventListener('click', () => {
    const mostrar = password.type === 'password';
    password.type = mostrar ? 'text' : 'password';
    ver.setAttribute('aria-label', mostrar ? 'Ocultar contraseña' : 'Mostrar contraseña');
    ver.innerHTML = `<i data-lucide="${mostrar ? 'eye-off' : 'eye'}"></i>`;
    renderIcons(ver);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    if (!email || !password.value) {
      errorEl.textContent = 'Completá el email y la contraseña.';
      errorEl.hidden = false;
      return;
    }

    errorEl.hidden = true;
    submit.disabled = true;
    submitText.textContent = 'Ingresando…';
    try {
      const sesion = await iniciarSesion(email, password.value);
      onLogin(sesion);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.hidden = false;
      password.select();
    } finally {
      submit.disabled = false;
      submitText.textContent = 'Ingresar';
    }
  });

  form.elements.email.focus();
}
