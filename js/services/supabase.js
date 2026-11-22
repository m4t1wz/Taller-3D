import { SUPABASE_URL, SUPABASE_KEY } from '../supabase.config.js';

const CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

export const supabaseConfigurado = Boolean(SUPABASE_URL && SUPABASE_KEY);

let clientPromise = null;

/** Devuelve el cliente de Supabase (la librería se carga recién cuando hace falta). */
export function getSupabase() {
  if (!supabaseConfigurado) {
    return Promise.reject(new Error('Supabase no está configurado. Revisá js/supabase.config.js.'));
  }
  if (!clientPromise) {
    clientPromise = import(CDN)
      .then(({ createClient }) =>
        createClient(SUPABASE_URL, SUPABASE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
        }))
      .catch((err) => {
        clientPromise = null;
        throw new Error('No se pudo conectar con Supabase. Revisá tu conexión a internet.', { cause: err });
      });
  }
  return clientPromise;
}

/** Ejecuta una consulta sobre una tabla y lanza un Error entendible si falla. */
export async function consultar(tabla, construir, accion) {
  const sb = await getSupabase();
  const { data, error } = await construir(sb.from(tabla));
  if (error) throw new Error(mensajeError(error, accion));
  return data;
}

/** Llama a una función SQL (RPC). */
export async function llamarFuncion(nombre, params, accion) {
  const sb = await getSupabase();
  const { data, error } = await sb.rpc(nombre, params);
  if (error) throw new Error(mensajeError(error, accion));
  return data;
}

/** Traduce errores de Supabase/PostgREST a mensajes entendibles. */
export function mensajeError(error, accion = 'completar la operación') {
  const code = error?.code ?? '';
  const msg = String(error?.message ?? '');

  if (code === '42P01' || code === 'PGRST205' || /relation .* does not exist|Could not find the table/i.test(msg)) {
    return 'Falta crear la tabla en Supabase. Corré los scripts de la carpeta sql/ (ver SUPABASE_SETUP.md).';
  }
  if (code === 'PGRST202' || /Could not find the function/i.test(msg)) {
    return 'Falta crear la función en Supabase. Corré sql/02_filamentos.sql (ver SUPABASE_SETUP.md).';
  }
  if (code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return 'Sin permisos. Cerrá sesión y volvé a entrar; si sigue, revisá el email en sql/03_login.sql.';
  }
  if (code === 'P0001') {
    return msg; // mensaje propio lanzado desde una función SQL
  }
  if (/Invalid API key|JWT/i.test(msg)) {
    return 'La clave de Supabase no es válida. Revisá js/supabase.config.js.';
  }
  if (/Failed to fetch|NetworkError/i.test(msg)) {
    return 'No se pudo conectar con Supabase. Revisá tu conexión o si el proyecto está pausado.';
  }
  return `No se pudo ${accion}: ${msg || 'error desconocido'}`;
}
