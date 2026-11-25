// =====================================================================
// Taller 3D · Diagnóstico de la impresora (SOLO LECTURA)
// Se conecta al WebSocket de la Ender 3 V3 KE (puerto 9999), escucha lo
// que publica y pide el historial. No envía comandos de impresión.
//
// Uso:   node puente/diagnostico.mjs <IP> [segundos]
// Ej.:   node puente/diagnostico.mjs 192.168.1.50 120
// Requiere Node.js 22 o superior (WebSocket incluido).
// =====================================================================
import { mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ip = process.argv[2];
const segundos = Number(process.argv[3] ?? 60);

if (!ip) {
  console.error('Uso: node puente/diagnostico.mjs <IP de la impresora> [segundos]');
  process.exit(1);
}
if (typeof WebSocket === 'undefined') {
  console.error('Necesitás Node.js 22 o superior.');
  process.exit(1);
}

const carpeta = join(dirname(fileURLToPath(import.meta.url)), 'logs');
mkdirSync(carpeta, { recursive: true });
const archivo = join(carpeta, `diagnostico-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);

const ultimos = new Map(); // clave -> último valor visto
const CLAVES_INTERES = ['state', 'printFileName', 'usedMaterialLength', 'printProgress', 'printJobTime',
  'printLeftTime', 'realTimeFlow', 'materialDetect', 'model', 'hostname', 'modelVersion'];
let mensajes = 0;

const resumir = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
};

console.log(`Conectando a ws://${ip}:9999 durante ${segundos} s ...`);
const ws = new WebSocket(`ws://${ip}:9999`);

const timeout = setTimeout(() => {
  console.error('No se pudo conectar en 10 s. ¿IP correcta? ¿Impresora prendida y en la misma red?');
  process.exit(2);
}, 10_000);

ws.addEventListener('open', () => {
  clearTimeout(timeout);
  console.log('Conectado. Pidiendo historial y archivos (solo lectura)...\n');
  ws.send(JSON.stringify({
    method: 'get',
    params: { reqGcodeFile: 1, reqGcodeList: 1, reqHistory: 1, reqPrintObjects: 1 },
  }));
  setTimeout(() => ws.close(), segundos * 1000);
});

ws.addEventListener('message', (ev) => {
  mensajes++;
  const texto = String(ev.data);
  appendFileSync(archivo, JSON.stringify({ t: new Date().toISOString(), data: texto }) + '\n');

  let data;
  try { data = JSON.parse(texto); } catch { return; }
  if (!data || typeof data !== 'object') return;

  // Algunas versiones mandan un heartbeat y esperan "ok"
  if (data.ModeCode === 'heart_beat') { ws.send('ok'); return; }

  for (const [k, v] of Object.entries(data)) {
    ultimos.set(k, v);
    if (CLAVES_INTERES.includes(k)) console.log(`  ${k} = ${resumir(v)}`);
    if (Array.isArray(v) && /hist/i.test(k)) {
      console.log(`  ${k}: ${v.length} entradas. Primera: ${resumir(v[0])}`);
    }
  }
});

ws.addEventListener('error', (e) => console.error('Error de conexión:', e.message ?? e.type));

ws.addEventListener('close', () => {
  clearTimeout(timeout);
  console.log(`\n=== Resumen: ${mensajes} mensajes, ${ultimos.size} campos distintos ===`);
  for (const [k, v] of [...ultimos].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`${k.padEnd(28)} ${resumir(v)}`);
  }
  console.log(`\nTodo lo recibido quedó guardado en:\n${archivo}`);
  process.exit(0);
});
