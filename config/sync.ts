import env from '#start/env'

/**
 * Maximo ratio (excluidos / productos traidos de BC) para ejecutar purgeExcludedFromPricelist.
 * Por defecto 0.85: el price list del pais suele cubrir menos SKUs que el catalogo completo.
 */
function pricelistPurgeMaxExcludedRatio(): number {
  const raw = env.get('PRICELIST_PURGE_MAX_EXCLUDED_RATIO')
  const n = raw ?? 0.85
  return Math.min(1, Math.max(0.05, n))
}

/**
 * Constantes de sincronizacion.
 * Centraliza tamanos de lote, timeouts y prefijos de cache para evitar magic numbers en servicios.
 */
export default {
  batchSize: 200,
  cacheTtlProductsSeconds: 60,
  cacheInvalidationPrefixProducts: 'products',
  get pricelistPurgeMaxExcludedRatio() {
    return pricelistPurgeMaxExcludedRatio()
  },
}
