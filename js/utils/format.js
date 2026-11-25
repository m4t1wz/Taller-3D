const nf = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Redondea a 2 decimales corrigiendo errores de coma flotante (47.88499999 -> 47.89). */
export function redondear2(valor) {
  const n = Number.isFinite(valor) ? valor : 0;
  return Math.round(Number(n.toPrecision(12)) * 100) / 100;
}

/** 2921.38 -> "AR$ 2.921,38" */
export function formatARS(valor) {
  return `AR$ ${nf.format(redondear2(Number(valor)))}`;
}

/** Número a texto con coma decimal, sin ceros de más: 2.5 -> "2,5" */
export function formatNumero(valor) {
  if (!Number.isFinite(valor)) return '';
  return String(valor).replace('.', ',');
}

const gf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });

/** 1250.5 -> "1.250,5 g" */
export function formatGramos(valor) {
  const n = Number(valor);
  return `${gf.format(Number.isFinite(n) ? n : 0)} g`;
}

const kgf = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });

/** 3200 -> "3,2 kg" · 750 -> "750 g" */
export function formatPeso(gramos) {
  const n = Number(gramos) || 0;
  return n >= 1000 ? `${kgf.format(n / 1000)} kg` : formatGramos(n);
}

/** "MiniPickleBuddy.stl_PLA_7m54s.gcode" -> "MiniPickleBuddy" (saca extensión y sufijo de Creality Print). */
export function nombrePieza(archivo) {
  return String(archivo ?? '')
    .replace(/^.*\//, '')
    .replace(/\.gcode$/i, '')
    .replace(/(\.stl)?_[A-Z]{2,5}_\d+h?\d*m?\d*s?$/i, '') || 'Sin nombre';
}

/** Diferencia en segundos -> "hace 3 min", "hace 2 h", "hace 4 días". */
export function haceTiempo(segundos) {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return 'hace un momento';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

/** ISO -> "22/11/2026" */
export function formatFecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-AR');
}

/**
 * Convierte texto ingresado por el usuario a número.
 * Acepta "3,7", "3.7", "18.000", "18.000,50". Vacío o inválido -> 0.
 */
export function parseNumero(texto) {
  if (texto == null) return 0;
  let s = String(texto).trim().replace(/\s/g, '');
  if (!s) return 0;

  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ''); // puntos como separador de miles
  }

  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
