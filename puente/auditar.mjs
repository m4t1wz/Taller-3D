// =====================================================================
// Taller 3D · Auditoría: ¿se registró TODO el filamento gastado?
//
// Lee el historial de la impresora (últimas 50 impresiones) y lo compara
// con lo registrado en Supabase. Solo lectura: no descuenta nada.
//
// Uso: node puente/auditar.mjs   (o doble clic en auditar.bat)
// =====================================================================
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(DIR, 'config.json'), 'utf8'));
const ip = config.ultimaIp ?? config.impresora;

const GRAMOS_POR_MM_PLA = 0.0024053 * 1.24;

const nombre = (f) => String(f ?? '').split('/').pop().replace(/\.gcode$/i, '')
  .replace(/(\.stl)?_[A-Z]{2,5}_\d+h?\d*m?\d*s?$/i, '');
const fecha = (unix) => new Date(unix * 1000).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});
const fmt = (n, d = 2) => Number(n).toLocaleString('es-AR', { maximumFractionDigits: d });

/** Pide el historial a la impresora y verifica que sea la correcta (por nombre). */
function leerHistorial() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${ip}:9999`);
    let hostname = null;
    const t = setTimeout(() => { ws.close(); reject(new Error(`La impresora no respondió en ${ip}. ¿Está prendida? (si cambió de IP, el puente la actualiza solo)`)); }, 15000);
    ws.addEventListener('open', () => ws.send(JSON.stringify({
      method: 'get', params: { reqGcodeFile: 1, reqGcodeList: 1, reqHistory: 1, reqPrintObjects: 1 },
    })));
    ws.addEventListener('message', (ev) => {
      let d;
      try { d = JSON.parse(String(ev.data)); } catch { return; }
      if (d?.hostname) hostname = String(d.hostname);
      if (Array.isArray(d?.historyList)) {
        clearTimeout(t);
        ws.close();
        if (config.hostname && hostname && hostname !== config.hostname) {
          reject(new Error(`En ${ip} hay otro equipo ("${hostname}").`));
        } else {
          resolve(d.historyList);
        }
      }
    });
    ws.addEventListener('error', () => {});
  });
}

async function registrosEnSupabase(ids) {
  const res = await fetch(`${config.supabaseUrl}/rest/v1/rpc/puente_auditar`, {
    method: 'POST',
    headers: { apikey: config.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: config.token, p_ids: ids }),
    signal: AbortSignal.timeout(20_000),
  });
  const cuerpo = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${cuerpo?.message ?? ''}`);
  return new Map(cuerpo.map((r) => [Number(r.impresora_print_id), r]));
}

try {
  console.log(`\nAuditoría Taller 3D · impresora "${config.hostname ?? ip}"\n`);
  const historial = await leerHistorial();
  const registros = await registrosEnSupabase(historial.map((h) => h.id));

  const cont = { ok: 0, pendiente: 0, previa: 0, curso: 0, falta: 0, difiere: 0 };
  const filas = historial.map((h, i) => {
    const r = registros.get(Number(h.id));
    const mm = Number(h.usagematerial);
    const sinTiempo = Number(h.usagetime) <= 0;
    let estado;

    // Sin tiempo registrado: la más nueva puede estar imprimiéndose; las demás no gastaron nada
    if (!r && sinTiempo && i === 0) { estado = '… en curso'; cont.curso++; }
    else if (!r && sinTiempo) { estado = '➖ sin consumo (0 mm)'; cont.previa++; }
    else if (!r) { estado = '❌ FALTA REGISTRAR'; cont.falta++; }
    else if (r.estado === 'ignorada') { estado = '➖ previa / ignorada'; cont.previa++; }
    else if (Math.abs(Number(r.milimetros ?? 0) - mm) > 1) {
      estado = `⚠ mm distintos (${fmt(r.milimetros, 0)} vs ${fmt(mm, 0)})`; cont.difiere++;
    } else if (r.estado === 'pendiente') { estado = '⏳ pendiente de asignar'; cont.pendiente++; }
    else { estado = `✔ ${fmt(r.gramos)} g de ${r.filamento ?? '(filamento borrado)'}`; cont.ok++; }

    return {
      Fecha: fecha(h.starttime ?? h.id),
      Pieza: nombre(h.filename).slice(0, 34),
      Fin: sinTiempo ? '' : Number(h.printfinish) === 1 ? 'terminó' : 'cancelada',
      'mm': fmt(mm, 0),
      'g aprox': fmt(mm * GRAMOS_POR_MM_PLA),
      'En el sistema': estado,
    };
  });

  // Solo mostrar lo relevante: todo lo que no es "previa"
  const relevantes = filas.filter((f) => !f['En el sistema'].startsWith('➖'));
  if (relevantes.length) console.table(relevantes);
  else console.log('(No hay impresiones posteriores al puente todavía.)\n');

  console.log(`Registradas y descontadas: ${cont.ok}`);
  console.log(`Pendientes de asignar:     ${cont.pendiente}${cont.pendiente ? '  → asignalas en la sección Impresiones' : ''}`);
  console.log(`En curso:                  ${cont.curso}`);
  console.log(`Previas / sin consumo:     ${cont.previa} (no se descuentan, a propósito)`);
  console.log(`Con mm distintos:          ${cont.difiere}`);
  console.log(`FALTAN REGISTRAR:          ${cont.falta}`);

  if (cont.falta || cont.difiere) {
    console.log('\n⚠ Hay diferencias. Si el puente está corriendo, puede que todavía no haya sincronizado: esperá 1 minuto y repetí.');
    process.exitCode = 1;
  } else {
    console.log('\n✅ Todo el filamento gastado está registrado.');
  }
} catch (err) {
  console.error('\nNo se pudo auditar:', err.message);
  process.exitCode = 2;
}
setTimeout(() => process.exit(), 300);
