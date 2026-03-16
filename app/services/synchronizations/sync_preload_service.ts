import type { BigCommerceProduct } from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type {
  ReviewData,
  TimerData,
  SyncEnrichmentData,
} from '#interfaces/product-sync/sync.interfaces'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import { DateTime } from 'luxon'
import pLimit from 'p-limit'

/**
 * Pre-carga datos de enriquecimiento desde BigCommerce en batch.
 * Aísla las llamadas N+1 necesarias (reviews, timer) con control de concurrencia.
 */
export default class SyncPreloadService {
  private readonly logger = Logger.child({ service: 'SyncPreloadService' })
  private readonly bigcommerceService: BigCommerceService

  private static readonly CONCURRENCY = 10

  constructor() {
    this.bigcommerceService = new BigCommerceService()
  }

  async loadAll(products: BigCommerceProduct[]): Promise<SyncEnrichmentData> {
    const [reviewsMap, timerMap] = await Promise.all([
      this.loadReviews(products),
      this.loadTimerMetafields(products),
    ])

    this.logger.info(
      { reviews: reviewsMap.size, timers: timerMap.size },
      'Datos de enriquecimiento pre-cargados'
    )

    return { reviewsMap, timerMap }
  }

  /**
   * Solo carga reviews para productos que realmente tienen (reviews_count > 0).
   * Evita llamadas innecesarias a la API de BC.
   */
  private async loadReviews(products: BigCommerceProduct[]): Promise<Map<number, ReviewData>> {
    const map = new Map<number, ReviewData>()

    const withReviews = products.filter((p) => p.reviews_count > 0)
    if (withReviews.length === 0) return map

    this.logger.info({ count: withReviews.length }, 'Cargando reviews...')

    const limit = pLimit(SyncPreloadService.CONCURRENCY)
    await Promise.all(
      withReviews.map((p) =>
        limit(async () => {
          try {
            const reviews = await this.bigcommerceService.getReviewsByProduct(p.id)
            if (reviews?.quantity > 0) {
              map.set(p.id, reviews)
            }
          } catch (error: any) {
            this.logger.warn({ product_id: p.id, error: error.message }, 'Error cargando review')
          }
        })
      )
    )

    return map
  }

  private async loadTimerMetafields(
    products: BigCommerceProduct[]
  ): Promise<Map<number, TimerData>> {
    const map = new Map<number, TimerData>()
    const timerKey = env.get('TIMER_METAFIELD_KEY', '')

    if (!timerKey) {
      this.logger.info('TIMER_METAFIELD_KEY no configurado, omitiendo carga de timers')
      return map
    }

    this.logger.info({ count: products.length, timerKey }, 'Cargando timer metafields...')

    const limit = pLimit(SyncPreloadService.CONCURRENCY)
    await Promise.all(
      products.map((p) =>
        limit(async () => {
          try {
            let metafieldRaw = await this.bigcommerceService.getMetafieldsByProduct(p.id, timerKey)
            const metafield =
              typeof metafieldRaw === 'string'
                ? (JSON.parse(metafieldRaw) as { timer_status?: boolean; timer_price?: number; timer_datetime?: string } | null)
                : Array.isArray(metafieldRaw) && metafieldRaw.length
                  ? (JSON.parse(String(metafieldRaw)) as { timer_status?: boolean; timer_price?: number; timer_datetime?: string } | null)
                  : null

            if (metafield && typeof metafield === 'object' && metafield.timer_status) {
              map.set(p.id, {
                timer_status: Boolean(metafield.timer_status),
                timer_price: metafield.timer_price || 0,
                timer_datetime: metafield.timer_datetime
                  ? DateTime.fromJSDate(new Date(metafield.timer_datetime))
                  : null,
              })
            }
          } catch (error: any) {
            this.logger.warn({ product_id: p.id, error: error.message }, 'Error cargando timer')
          }
        })
      )
    )

    return map
  }
}
