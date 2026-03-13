import CategoryProduct from '#models/category_product'
import ChannelProduct from '#models/channel_product'
import Option from '#models/option'
import Product from '#models/product'
import Variant from '#models/variant'
import Logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'

/**
 * Responsabilidad unica: detectar y limpiar productos descontinuados.
 * Implementa un safety threshold para evitar limpiezas masivas por error de API.
 */
export default class SyncCleanupService {
  private readonly logger = Logger.child({ service: 'SyncCleanupService' })

  // Si mas del 50% de productos desaparecen, probablemente es un error de la API
  private static readonly SAFETY_THRESHOLD = 0.5

  /**
   * Oculta productos que ya no estan en BigCommerce y limpia entidades huerfanas.
   * Aborta si detecta que la proporcion de obsoletos supera el umbral de seguridad.
   */
  async run(activeProductIds: number[]): Promise<void> {
    if (activeProductIds.length === 0) return

    const existingProducts = await Product.query().select('id')
    const existingIds = existingProducts.map((p) => p.id)

    const obsoleteIds = existingIds.filter((id) => !activeProductIds.includes(id))

    if (obsoleteIds.length === 0) {
      this.logger.info('No hay productos obsoletos para limpiar')
      return
    }

    if (this.exceedsSafetyThreshold(obsoleteIds.length, existingIds.length)) {
      return
    }

    this.logger.info({ count: obsoleteIds.length }, 'Limpiando productos descontinuados...')

    await db.transaction(async (trx) => {
      await Product.query({ client: trx })
        .whereIn('id', obsoleteIds)
        .update({ is_visible: false })

      const deletedVariants = await Variant.query({ client: trx })
        .whereIn('product_id', obsoleteIds)
        .delete()

      const deletedOptions = await Option.query({ client: trx })
        .whereIn('product_id', obsoleteIds)
        .delete()

      const deletedCategories = await CategoryProduct.query({ client: trx })
        .whereIn('product_id', obsoleteIds)
        .delete()

      const deletedChannels = await ChannelProduct.query({ client: trx })
        .whereNotIn('product_id', activeProductIds)
        .delete()

      this.logger.info(
        {
          hidden_products: obsoleteIds.length,
          deleted_variants: deletedVariants,
          deleted_options: deletedOptions,
          deleted_categories: deletedCategories,
          deleted_channels: deletedChannels,
        },
        'Limpieza completada'
      )
    })
  }

  private exceedsSafetyThreshold(obsoleteCount: number, totalCount: number): boolean {
    const ratio = obsoleteCount / totalCount

    if (ratio > SyncCleanupService.SAFETY_THRESHOLD) {
      this.logger.error(
        {
          obsolete: obsoleteCount,
          total: totalCount,
          ratio: `${(ratio * 100).toFixed(1)}%`,
        },
        'Abortando limpieza: demasiados productos obsoletos (posible error de API)'
      )
      return true
    }

    return false
  }
}
