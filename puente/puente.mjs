// =====================================================================
// Taller 3D · Puente impresora → Supabase
//
// Escucha la Ender 3 V3 KE (WebSocket :9999, solo lectura) y, cuando
// termina una impresión, manda las entradas nuevas del historial a
// Supabase, que las descuenta del filamento activo.
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
import net from 'node:net';

const DIR = dirname(fileURLToPath(import.meta.url));
const UNA_VEZ = process.argv.includes('--una-vez');

const SYNC_PERIODICA_MS = 10 * 60 * 1000; // revisar historial cada 10 min igual
const ESPERA_FIN_MS = 4000;               // tras terminar, esperar a que el historial se actualice
const SILENCIO_MAX_MS = 45 * 1000;        // sin mensajes de la impresora -> reconectar
const RECONEXION_MIN_MS = 10 * 1000;
const RECONEXION_MAX_MS = 2 * 60 * 1000;
const LOG_MAX_BYTES = 1024 * 1024;
const LATIDO_MS = 60 * 1000;              // "estoy vivo" a Supabase cada minuto
const FALLOS_PARA_BUSCAR = 3;             // intentos fallidos seguidos antes de buscar la IP
const ESCANEO_CADA_MS = 10 * 60 * 1000;   // no escanear la red más de una vez cada 10 min

const PEDIDO_HISTORIAL = JSON.stringify({
  method: 'get',
  params: { reqGcodeFile: 1, reqGcodeList: 1, reqHistory: 1, reqPrintObjects: 1 },
});

/* ---------- Configuración ---------- */

let config;
try {
  config = JSON.parse(readFileSync(join(DIR, 'config.json'), 'utf8'));
} catch {
  console.error('Falta puente/config.json (copiá config.example.json y completalo).');
  process.exit(1);
}
for (const k of ['impresora', 'supabaseUrl', 'supabaseKey', 'token']) {
  if (!config[k]) {
    console.error(`Falta "${k}" en puente/config.json`);
    process.exit(1);
  }
}
if (typeof WebSocket === 'undefined') {
  console.error('Necesitás Node.js 22 o superior.');
  process.exit(1);
}

/* ---------- Una sola instancia ---------- */

const LOCK = join(DIR, 'logs', 'puente.pid');
if (!UNA_VEZ) {
  mkdirSync(join(DIR, 'logs'), { recursive: true });
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

const LOG_DIR = join(DIR, 'logs');
const LOG_FILE = join(LOG_DIR, 'puente.log');
mkdirSync(LOG_DIR, { recursive: true });

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
let ultimoMensaje = 0;
let espera = RECONEXION_MIN_MS;
let timerFin = null;

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
  if (ws?.readyState !== WebSocket.OPEN) return 'sin_conexion';
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

/* ---------- Búsqueda de la impresora si cambia de IP ---------- */

let fallosSeguidos = 0;
let ultimoEscaneo = 0;

function guardarConfig() {
  try {
    writeFileSync(join(DIR, 'config.json'), JSON.stringify(config, null, 2) + '\n');
  } catch (err) {
    log('No se pudo guardar config.json:', err.message);
  }
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

/** ¿Es NUESTRA impresora? Compara el hostname que publica por el WebSocket. */
function esMiImpresora(ip) {
  return new Promise((resolve) => {
    let listo = false;
    const w = new WebSocket(`ws://${ip}:9999`);
    const fin = (ok) => {
      if (listo) return;
      listo = true;
      clearTimeout(t);
      try { w.close(); } catch { /* nada */ }
      resolve(ok);
    };
    const t = setTimeout(() => fin(false), 6000);
    w.addEventListener('message', (ev) => {
      let d;
      try { d = JSON.parse(String(ev.data)); } catch { return; }
      if (d?.hostname) fin(config.hostname ? d.hostname === config.hostname : true);
    });
    w.addEventListener('close', () => fin(false));
    w.addEventListener('error', () => { /* close se encarga */ });
  });
}

async function buscarImpresora() {
  ultimoEscaneo = Date.now();
  const base = String(config.impresora).split('.').slice(0, 3).join('.');
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(base)) return;

  log(`No encuentro la impresora en ${config.impresora}. Buscándola en la red ${base}.x…`);
  const ips = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`);
  const candidatos = [];
  for (let i = 0; i < ips.length; i += 32) {
    const lote = ips.slice(i, i + 32);
    const abiertos = await Promise.all(lote.map((ip) => puertoAbierto(ip).then((ok) => (ok ? ip : null))));
    candidatos.push(...abiertos.filter(Boolean));
  }

  for (const ip of candidatos) {
    if (await esMiImpresora(ip)) {
      if (ip !== config.impresora) {
        log(`Impresora encontrada en ${ip} (antes ${config.impresora}). IP actualizada.`);
        config.impresora = ip;
        guardarConfig();
      } else {
        log('La impresora sigue en la misma IP (¿estaba apagada?).');
      }
      return;
    }
  }
  log('No encontré la impresora en la red (¿está apagada?). Sigo intentando.');
}

/* ---------- Impresora ---------- */

function pedirHistorial() {
  if (ws?.readyState === WebSocket.OPEN) ws.send(PEDIDO_HISTORIAL);
}

function procesar(data) {
  if (data.ModeCode === 'heart_beat') {
    ws.send('ok');
    return;
  }

  // Aprender el nombre de la impresora (sirve para encontrarla si cambia de IP)
  if (data.hostname && config.hostname !== data.hostname && !config.hostname) {
    config.hostname = String(data.hostname);
    guardarConfig();
    log(`Impresora identificada como "${config.hostname}".`);
  }

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
      log(`Imprimiendo: ${String(data.printFileName ?? '').split('/').pop() || '(archivo)'}`);
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

function conectar() {
  log(`Conectando a la impresora ${config.impresora}…`);
  ws = new WebSocket(`ws://${config.impresora}:9999`);
  let abierto = false;

  ws.addEventListener('open', () => {
    abierto = true;
    fallosSeguidos = 0;
    log('Conectado a la impresora.');
    espera = RECONEXION_MIN_MS;
    ultimoMensaje = Date.now();
    pedirHistorial();
  });

  ws.addEventListener('message', (ev) => {
    ultimoMensaje = Date.now();
    let data;
    try { data = JSON.parse(String(ev.data)); } catch { return; }
    if (data && typeof data === 'object') procesar(data);
  });

  ws.addEventListener('close', () => {
    if (terminando) return;
    if (UNA_VEZ) {
      log('La conexión se cerró antes de sincronizar.');
      terminar(1);
      return;
    }
    latido(); // avisa "impresora sin conexión"

    if (!abierto) fallosSeguidos++;
    // Varios intentos fallidos seguidos: ¿cambió la IP? Buscarla en la red (como mucho cada 10 min)
    if (fallosSeguidos >= FALLOS_PARA_BUSCAR && Date.now() - ultimoEscaneo > ESCANEO_CADA_MS) {
      buscarImpresora().finally(() => {
        fallosSeguidos = 0;
        espera = RECONEXION_MIN_MS;
        conectar();
      });
      return;
    }

    log(`Desconectado. Reintento en ${Math.round(espera / 1000)} s.`);
    setTimeout(conectar, espera);
    espera = Math.min(espera * 2, RECONEXION_MAX_MS);
  });

  ws.addEventListener('error', () => { /* el evento close se encarga */ });
}

let terminando = false;

function terminar(codigo) {
  if (terminando) return;
  terminando = true;
  process.exitCode = codigo;
  try { ws?.close(); } catch { /* nada */ }
  // Salir después de que se cierre el socket (salir de golpe rompe libuv en Windows)
  setTimeout(() => process.exit(codigo), 500);
}

/* ---------- Arranque ---------- */

log(UNA_VEZ ? 'Puente: sincronización única.' : 'Puente iniciado.');
conectar();

if (UNA_VEZ) {
  setTimeout(() => {
    log('No hubo respuesta en 30 s (¿impresora apagada?).');
    terminar(1);
  }, 30_000);
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
