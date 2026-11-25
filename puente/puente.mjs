// =====================================================================
// Taller 3D · Puente impresora → Supabase
//
// Escucha la Ender 3 V3 KE (WebSocket :9999, solo lectura) y, cuando
// termina una impresión, manda las entradas nuevas del historial a
// Supabase, que las descuenta del filamento activo.
//
// La impresora se identifica por su NOMBRE (hostname), no por la IP:
// la IP es solo un atajo ("la última vez estaba acá"). Al conectar se
// verifica el nombre; si no coincide o no responde, se la busca en la red.
//
// Uso:
//   node puente/puente.mjs            (queda corriendo, se reconecta solo)
//   node puente/puente.mjs --una-vez  (sincroniza una vez y termina)
//
// Configuración: puente/config.json (ver config.example.json)
// Requiere Node.js 22 o superior.
// =====================================================================
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import net from 'node:net';

const DIR = dirname(fileURLToPath(import.meta.url));
const UNA_VEZ = process.argv.includes('--una-vez');

const SYNC_PERIODICA_MS = 10 * 60 * 1000; // revisar historial cada 10 min igual
const ESPERA_FIN_MS = 4000;               // tras terminar, esperar a que el historial se actualice
const SILENCIO_MAX_MS = 45 * 1000;        // sin mensajes de la impresora -> reconectar
const IDENTIFICACION_MS = 10 * 1000;      // tiempo para que la impresora diga su nombre
const RECONEXION_MIN_MS = 10 * 1000;
const RECONEXION_MAX_MS = 2 * 60 * 1000;
const LOG_MAX_BYTES = 1024 * 1024;
const LATIDO_MS = 60 * 1000;              // "estoy vivo" a Supabase cada minuto
const FALLOS_PARA_BUSCAR = 2;             // intentos fallidos seguidos antes de buscarla por nombre
const ESCANEO_CADA_MS = 5 * 60 * 1000;    // no escanear la red más de una vez cada 5 min

const PEDIDO_HISTORIAL = JSON.stringify({
  method: 'get',
  params: { reqGcodeFile: 1, reqGcodeList: 1, reqHistory: 1, reqPrintObjects: 1 },
});

/* ---------- Configuración ---------- */

const CONFIG_FILE = join(DIR, 'config.json');
let config;
try {
  config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
} catch {
  console.error('Falta puente/config.json (copiá config.example.json y completalo).');
  process.exit(1);
}

function guardarConfig() {
  try {
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n');
  } catch (err) {
    log('No se pudo guardar config.json:', err.message);
  }
}

// Formato viejo: "impresora" (IP fija) -> "ultimaIp" (solo un atajo)
if (config.impresora && !config.ultimaIp) {
  config.ultimaIp = config.impresora;
  delete config.impresora;
  guardarConfig();
}

for (const k of ['supabaseUrl', 'supabaseKey', 'token']) {
  if (!config[k]) {
    console.error(`Falta "${k}" en puente/config.json`);
    process.exit(1);
  }
}
if (!config.hostname && !config.ultimaIp) {
  console.error('Falta "hostname" (nombre de la impresora, ej. Ender3V3KE-DC21) en puente/config.json');
  process.exit(1);
}
if (typeof WebSocket === 'undefined') {
  console.error('Necesitás Node.js 22 o superior.');
  process.exit(1);
}

/* ---------- Una sola instancia ---------- */

const LOG_DIR = join(DIR, 'logs');
const LOCK = join(LOG_DIR, 'puente.pid');
mkdirSync(LOG_DIR, { recursive: true });

if (!UNA_VEZ) {
  try {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    if (pid && pid !== process.pid) {
      process.kill(pid, 0); // tira error si ese proceso ya no existe
      console.log(`El puente ya está corriendo (PID ${pid}).`);
      process.exit(0);
    }
  } catch { /* no hay otro puente corriendo */ }
  writeFileSync(LOCK, String(process.pid));
  const liberar = () => { try { if (Number(readFileSync(LOCK, 'utf8')) === process.pid) unlinkSync(LOCK); } catch { /* nada */ } };
  process.on('exit', liberar);
  process.on('SIGINT', () => process.exit(0));
  process.on('SIGTERM', () => process.exit(0));
}

/* ---------- Log ---------- */

const LOG_FILE = join(LOG_DIR, 'puente.log');

function log(...partes) {
  const linea = `[${new Date().toLocaleString('es-AR')}] ${partes.join(' ')}`;
  console.log(linea);
  try {
    if (statSync(LOG_FILE, { throwIfNoEntry: false })?.size > LOG_MAX_BYTES) {
      renameSync(LOG_FILE, `${LOG_FILE}.1`);
    }
    appendFileSync(LOG_FILE, linea + '\n');
  } catch { /* el log nunca debe tirar abajo el puente */ }
}

/* ---------- Estado ---------- */

const enviados = new Set();  // ids del historial ya confirmados por Supabase (en esta sesión)
let estadoImpresora = null;  // último "state" (1 = imprimiendo, 2 = terminada, 5 = pausa)
let inicioActual = null;     // printStartTime de la impresión en curso (= id en el historial)
let archivoActual = '';
let progresoActual = null;
let ultimoErrorLatido = '';
let sincronizando = false;
let ws = null;
let identificada = false;    // la conexión actual es de NUESTRA impresora (nombre verificado)
let ultimoMensaje = 0;
let espera = RECONEXION_MIN_MS;
let timerFin = null;
let fallosSeguidos = 0;
let ultimoEscaneo = 0;
let terminando = false;

/* ---------- Supabase ---------- */

async function sincronizar(historial) {
  if (sincronizando) return;

  const nuevas = historial
    .filter((h) => h && h.id != null && !enviados.has(h.id))
    // La KE agrega la impresión al historial apenas EMPIEZA (con 0 mm y 0 s).
    // Solo se manda cuando ya terminó: tiene tiempo registrado y no es la que está en curso.
    .filter((h) => Number(h.usagetime) > 0)
    .filter((h) => !(estadoImpresora === 1 && inicioActual && Number(h.id) === Number(inicioActual)))
    .filter((h) => !(estadoImpresora === 1 && h === historial[0] && Number(h.printfinish) !== 1))
    .map((h) => ({
      id: h.id,
      filename: h.filename,
      usagematerial: h.usagematerial,
      usagetime: h.usagetime,
      printfinish: h.printfinish,
      starttime: h.starttime,
    }));

  // Nunca mandar una lista vacía (la 1ª sincronización marcaría el historial como visto sin datos)
  if (!nuevas.length) {
    if (UNA_VEZ) {
      log('No hay impresiones nuevas para enviar.');
      terminar(0);
    }
    return;
  }

  sincronizando = true;
  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/puente_sincronizar`, {
      method: 'POST',
      headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: config.token, p_items: nuevas.slice(0, 100) }),
      signal: AbortSignal.timeout(20_000),
    });
    const cuerpo = await res.json().catch(() => null);
    if (!res.ok) {
      log('ERROR Supabase:', res.status, cuerpo?.message ?? '');
      return;
    }

    nuevas.forEach((h) => enviados.add(h.id));
    const { base = 0, descontadas = 0, pendientes = 0 } = cuerpo ?? {};
    if (base) log(`Primera sincronización: ${base} impresiones previas marcadas como vistas (no se descontó nada).`);
    if (descontadas) log(`✔ ${descontadas} impresión(es) descontada(s) del filamento activo.`);
    if (pendientes) log(`⚠ ${pendientes} impresión(es) sin filamento activo: quedaron pendientes en el sitio.`);
    if (!base && !descontadas && !pendientes) log('Historial al día.');
  } catch (err) {
    log('ERROR al contactar Supabase:', err.message);
  } finally {
    sincronizando = false;
    if (UNA_VEZ) terminar(0);
  }
}

/* ---------- Latido (estado del puente en el Dashboard) ---------- */

function estadoParaLatido() {
  if (ws?.readyState !== WebSocket.OPEN || !identificada) return 'sin_conexion';
  if (estadoImpresora === 1) return 'imprimiendo';
  if (estadoImpresora === 5) return 'pausada';
  return 'libre';
}

async function latido() {
  if (UNA_VEZ) return;
  const estado = estadoParaLatido();
  const enCurso = estado === 'imprimiendo' || estado === 'pausada';
  try {
    const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/puente_latido`, {
      method: 'POST',
      headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_token: config.token,
        p_estado: estado,
        p_archivo: enCurso ? archivoActual : null,
        p_progreso: enCurso && Number.isFinite(progresoActual) ? Math.round(progresoActual) : null,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => null);
      throw new Error(`${res.status} ${cuerpo?.message ?? ''}`);
    }
    if (ultimoErrorLatido) {
      log('Latido restablecido.');
      ultimoErrorLatido = '';
    }
  } catch (err) {
    // Loguear solo cuando cambia el error, para no llenar el log
    if (err.message !== ultimoErrorLatido) {
      log('ERROR en el latido:', err.message);
      ultimoErrorLatido = err.message;
    }
  }
}

/* ---------- Búsqueda de la impresora por nombre ---------- */

/** Redes locales a revisar: las de esta PC + la de la última IP conocida (formato "192.168.1"). */
function redesLocales() {
  const redes = new Set();
  for (const lista of Object.values(networkInterfaces())) {
    for (const i of lista ?? []) {
      if (i.family === 'IPv4' && !i.internal && /^(10|172|192)\./.test(i.address)) {
        redes.add(i.address.split('.').slice(0, 3).join('.'));
      }
    }
  }
  if (config.ultimaIp) redes.add(String(config.ultimaIp).split('.').slice(0, 3).join('.'));
  return [...redes].filter((r) => /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(r));
}

/** ¿Hay algo escuchando en ip:9999? (rápido, sin WebSocket) */
function puertoAbierto(ip, ms = 600) {
  return new Promise((resolve) => {
    const s = net.connect({ host: ip, port: 9999 });
    const fin = (ok) => { s.destroy(); resolve(ok); };
    s.setTimeout(ms, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
}

/** Nombre (hostname) que publica el equipo en ip:9999, o null. */
function nombreEn(ip) {
  return new Promise((resolve) => {
    let listo = false;
    const w = new WebSocket(`ws://${ip}:9999`);
    const fin = (nombre) => {
      if (listo) return;
      listo = true;
      clearTimeout(t);
      try { w.close(); } catch { /* nada */ }
      resolve(nombre);
    };
    const t = setTimeout(() => fin(null), 6000);
    w.addEventListener('message', (ev) => {
      let d;
      try { d = JSON.parse(String(ev.data)); } catch { return; }
      if (d?.hostname) fin(String(d.hostname));
    });
    w.addEventListener('close', () => fin(null));
    w.addEventListener('error', () => { /* close se encarga */ });
  });
}

/** Busca en la red el equipo que se llama config.hostname y guarda su IP. */
async function buscarImpresora() {
  ultimoEscaneo = Date.now();
  const redes = redesLocales();
  log(`Buscando la impresora "${config.hostname}" en la red (${redes.map((r) => `${r}.x`).join(', ')})…`);

  for (const red of redes) {
    const ips = Array.from({ length: 254 }, (_, i) => `${red}.${i + 1}`);
    for (let i = 0; i < ips.length; i += 32) {
      const lote = ips.slice(i, i + 32);
      const abiertos = (await Promise.all(lote.map((ip) => puertoAbierto(ip).then((ok) => (ok ? ip : null)))))
        .filter(Boolean);
      for (const ip of abiertos) {
        if ((await nombreEn(ip)) === config.hostname) {
          if (ip !== config.ultimaIp) {
            log(`Impresora encontrada en ${ip}${config.ultimaIp ? ` (antes ${config.ultimaIp})` : ''}.`);
            config.ultimaIp = ip;
            guardarConfig();
          } else {
            log(`La impresora sigue en ${ip} (¿estaba apagada?).`);
          }
          return true;
        }
      }
    }
  }
  log('No encontré la impresora en la red (¿está apagada?). Sigo intentando.');
  return false;
}

/* ---------- Impresora ---------- */

function pedirHistorial() {
  if (identificada && ws?.readyState === WebSocket.OPEN) ws.send(PEDIDO_HISTORIAL);
}

function procesar(data) {
  if ('printStartTime' in data) inicioActual = data.printStartTime || null;
  if ('printFileName' in data) archivoActual = String(data.printFileName ?? '');
  if ('printProgress' in data) {
    const anteriorPct = progresoActual;
    progresoActual = Number(data.printProgress);
    // Avisar al Dashboard cada 10 % de avance
    if (Math.floor(progresoActual / 10) !== Math.floor((anteriorPct ?? -10) / 10)) latido();
  }

  if ('state' in data) {
    const anterior = estadoImpresora;
    estadoImpresora = Number(data.state);
    if (anterior !== estadoImpresora) latido();

    if (estadoImpresora === 1 && anterior !== 1) {
      log(`Imprimiendo: ${String(data.printFileName ?? archivoActual).split('/').pop() || '(archivo)'}`);
    }
    // Terminó (o se canceló): pedir el historial actualizado
    if (anterior === 1 && estadoImpresora !== 1 && estadoImpresora !== 5) {
      log(`La impresión terminó (estado ${estadoImpresora}). Revisando historial…`);
      clearTimeout(timerFin);
      timerFin = setTimeout(pedirHistorial, ESPERA_FIN_MS);
    }
  }

  if (Array.isArray(data.historyList)) {
    sincronizar(data.historyList);
  }
}

function programarReintento() {
  log(`Reintento en ${Math.round(espera / 1000)} s.`);
  setTimeout(conectar, espera);
  espera = Math.min(espera * 2, RECONEXION_MAX_MS);
}

function conectar() {
  if (terminando) return;

  // Sin IP conocida: buscarla por nombre (como mucho cada ESCANEO_CADA_MS)
  if (!config.ultimaIp) {
    if (Date.now() - ultimoEscaneo < ESCANEO_CADA_MS) { programarReintento(); return; }
    buscarImpresora().finally(() => (config.ultimaIp ? abrir(config.ultimaIp) : programarReintento()));
    return;
  }
  abrir(config.ultimaIp);
}

function abrir(ip) {
  log(`Conectando a ${ip}…`);
  ws = new WebSocket(`ws://${ip}:9999`);
  identificada = false;
  let otroEquipo = false;
  let timerIdentidad = null;

  ws.addEventListener('open', () => {
    ultimoMensaje = Date.now();
    // Si en IDENTIFICACION_MS no dice su nombre, no es (o no responde): cortar
    timerIdentidad = setTimeout(() => {
      if (!identificada) {
        log(`El equipo en ${ip} no se identificó.`);
        ws.close();
      }
    }, IDENTIFICACION_MS);
  });

  ws.addEventListener('message', (ev) => {
    ultimoMensaje = Date.now();
    let data;
    try { data = JSON.parse(String(ev.data)); } catch { return; }
    if (!data || typeof data !== 'object') return;

    if (data.ModeCode === 'heart_beat') {
      ws.send('ok');
      return;
    }

    // Verificar que sea NUESTRA impresora antes de usar cualquier dato
    if (!identificada) {
      if (!data.hostname) return;
      const nombre = String(data.hostname);
      if (!config.hostname) {
        config.hostname = nombre;
        guardarConfig();
        log(`Impresora identificada como "${nombre}".`);
      }
      if (nombre !== config.hostname) {
        log(`En ${ip} hay otro equipo ("${nombre}"), no "${config.hostname}".`);
        otroEquipo = true;
        ws.close();
        return;
      }
      identificada = true;
      clearTimeout(timerIdentidad);
      fallosSeguidos = 0;
      espera = RECONEXION_MIN_MS;
      log(`Conectado a "${nombre}" (${ip}).`);
      latido();
      pedirHistorial();
    }

    procesar(data);
  });

  ws.addEventListener('close', () => {
    clearTimeout(timerIdentidad);
    if (terminando) return;
    const eraNuestra = identificada;
    identificada = false;

    if (UNA_VEZ) {
      log('La conexión se cerró antes de sincronizar.');
      terminar(1);
      return;
    }
    latido(); // avisa "impresora sin conexión"

    if (!eraNuestra) fallosSeguidos++;
    // Otro equipo en esa IP, o varios fallos seguidos: buscarla por nombre
    const buscar = otroEquipo
      || (fallosSeguidos >= FALLOS_PARA_BUSCAR && Date.now() - ultimoEscaneo > ESCANEO_CADA_MS);
    if (buscar) {
      buscarImpresora().finally(() => {
        fallosSeguidos = 0;
        espera = RECONEXION_MIN_MS;
        conectar();
      });
      return;
    }

    log(eraNuestra ? 'Se perdió la conexión con la impresora.' : `No se pudo conectar a ${ip}.`);
    programarReintento();
  });

  ws.addEventListener('error', () => { /* el evento close se encarga */ });
}

function terminar(codigo) {
  if (terminando) return;
  terminando = true;
  process.exitCode = codigo;
  try { ws?.close(); } catch { /* nada */ }
  // Salir después de que se cierre el socket (salir de golpe rompe libuv en Windows)
  setTimeout(() => process.exit(codigo), 500);
}

/* ---------- Arranque ---------- */

log(UNA_VEZ ? 'Puente: sincronización única.' : `Puente iniciado (impresora: "${config.hostname ?? '?'}").`);
conectar();

if (UNA_VEZ) {
  setTimeout(() => {
    log('No hubo respuesta a tiempo (¿impresora apagada?).');
    terminar(1);
  }, 60_000);
} else {
  // Revisión periódica + latido + vigilancia de conexión colgada
  setInterval(pedirHistorial, SYNC_PERIODICA_MS);
  setInterval(latido, LATIDO_MS);
  setTimeout(latido, 3000);
  setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN && Date.now() - ultimoMensaje > SILENCIO_MAX_MS) {
      log('La impresora no responde, reconectando…');
      ws.close();
    }
  }, 15_000);
}
