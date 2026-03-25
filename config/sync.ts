/**
 * Constantes de sincronizacion.
 * Centraliza tamanos de lote, timeouts y prefijos de cache para evitar magic numbers en servicios.
 */
export default {
  batchSize: 200,
  cacheTtlProductsSeconds: 60,
  cacheInvalidationPrefixProducts: 'products',
}
