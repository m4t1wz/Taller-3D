import { RECARGO_INSUMOS } from '../config.js';

/**
 * Calcula costos y precios de una impresión 3D.
 * Todas las entradas son números (ya parseados).
 *
 * @param {object} p
 * @param {number} p.precioFilamento  AR$/kg
 * @param {number} p.precioKwh        AR$/kWh
 * @param {number} p.consumoW         W
 * @param {number} p.vidaUtil         horas
 * @param {number} p.costoRepuestos   AR$
 * @param {number} p.margenError      %
 * @param {number} p.horas            horas decimales (1,5 = 1 h 30 min)
 * @param {number} p.minutos          minutos adicionales
 * @param {number} p.gramos           g de filamento
 * @param {number} p.insumos          AR$ de insumos extra
 * @param {number} p.multiplicador    margen de ganancia (×)
 * @param {number} p.mlAdicional      se suma al multiplicador para MercadoLibre (0,8)
 */
export function calcularCostos(p) {
  const horasTotales = p.horas + p.minutos / 60;

  const material = (p.precioFilamento * p.gramos) / 1000;
  const luz = (p.consumoW / 1000) * horasTotales * p.precioKwh;
  const desgaste = p.vidaUtil > 0 ? (p.costoRepuestos / p.vidaUtil) * horasTotales : 0;

  const subtotal = material + luz + desgaste;
  const margenError = subtotal * (p.margenError / 100);
  const costoTotal = subtotal + margenError;

  const insumos = p.insumos * (1 + RECARGO_INSUMOS);

  const precioSinInsumos = costoTotal * p.multiplicador;
  const totalCobrar = precioSinInsumos + insumos;

  // MercadoLibre: costo × (multiplicador + adicional). Los insumos no llevan recargo.
  const multiplicadorML = p.multiplicador + p.mlAdicional;
  const precioML = costoTotal * multiplicadorML + insumos;
  const recargoML = p.multiplicador > 0 ? (p.mlAdicional / p.multiplicador) * 100 : 0;

  return {
    horasTotales,
    material,
    luz,
    desgaste,
    margenError,
    costoTotal,
    insumos,
    totalCobrar,
    precioML,
    multiplicadorML,
    recargoML,
  };
}
