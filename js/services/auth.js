import { getSupabase } from './supabase.js';

function mensajeAuth(error) {
  const msg = String(error?.message ?? '');
  if (/Invalid login credentials/i.test(msg)) return 'Email o contraseña incorrectos.';
  if (/Email not confirmed/i.test(msg)) {
    return 'El email no está confirmado. Confirmalo en Supabase (Authentication → Users).';
  }
  if (/rate limit|too many/i.test(msg)) return 'Demasiados intentos. Esperá un momento y probá de nuevo.';
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'No se pudo conectar con Supabase. Revisá tu conexión.';
  return msg || 'No se pudo iniciar sesión.';
}

/** Sesión guardada en el navegador, o null. */
export async function obtenerSesion() {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.getSession();
  if (error) throw new Error(mensajeAuth(error));
  return data.session;
}

export async function iniciarSesion(email, password) {
  const sb = await getSupabase();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(mensajeAuth(error));
  return data.session;
}

export async function cerrarSesion() {
  const sb = await getSupabase();
  await sb.auth.signOut();
}

/** cb(evento, sesion) — p.ej. 'SIGNED_IN', 'SIGNED_OUT' (también si expira o se cierra en otra pestaña). */
export async function alCambiarSesion(cb) {
  const sb = await getSupabase();
  sb.auth.onAuthStateChange((evento, sesion) => {
    // Diferido: Supabase recomienda no hacer trabajo pesado dentro del callback.
    setTimeout(() => cb(evento, sesion), 0);
  });
}
