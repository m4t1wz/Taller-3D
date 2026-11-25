// Valores por defecto y constantes de negocio.

export const PERFIL_DEFAULT = {
  precioFilamento: 18000, // AR$/kg
  precioKwh: 100,         // AR$
  consumoW: 100,          // W promedio
  vidaUtil: 4020,         // horas
  costoRepuestos: 15000,  // AR$
  margenError: 3,         // %
  // MercadoLibre: se suma al multiplicador -> costo × (mult + mlAdicional) + insumos
  mlAdicional: 0.8,
};

export const RECARGO_INSUMOS = 0.30; // +30 % sobre insumos extra

export const MULTIPLICADORES = [2, 2.5, 3, 3.5, 4, 5];

export const REFERENCIAS_MULTIPLICADOR = [
  { valor: 2, texto: 'Alto volumen / descuento' },
  { valor: 2.5, texto: 'Volumen medio' },
  { valor: 3, texto: 'Mayorista' },
  { valor: 3.5, texto: 'Intermedio' },
  { valor: 4, texto: 'Minorista' },
  { valor: 5, texto: 'Llaveros / piezas chicas' },
];

export const MULTIPLICADOR_DEFAULT = 2.5;

// Filamentos: porcentaje restante del rollo para cada nivel de color.
export const NIVEL_FILAMENTO = {
  mucho: 50, // más de 50 % -> verde
  poco: 20,  // menos de 20 % -> rojo (en el medio: amarillo)
};

export const ROLLO_DEFAULT_G = 1000;
export const DENSIDAD_DEFAULT = 1.24; // PLA, g/cm³
