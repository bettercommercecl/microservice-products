import syncConfig from '#config/sync'
import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import BrandService from '#services/brands_service'
import CacheService from '#services/cache_service'
import CategoryService from '#services/categories_service'
import N8nAlertService from '#services/n8n_alert_service'
import GlobalProductSyncService from '#services/synchronizations/global_product_sync_service'
import PackReserveSyncService from '#services/synchronizations/pack_reserve_sync_service'
import PacksSyncService from '#services/synchronizations/packs_sync_service'
import SyncWebhookNotifier from '#services/synchronizations/sync_webhook_notifier'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

/**
 * Orquesta la sincronizacion completa v2: marcas -> categorias -> productos -> packs -> packs reserva.
 */
export default class FullSyncController {
  private readonly logger = Logger.child({ service: 'FullSyncController' })

  async syncFull({ response }: HttpContext) {
    this.logger.info(
      'Sincronizacion completa solicitada: marcas -> categorias -> productos -> packs -> packs reserva'
    )

    const results: Record<string, unknown> = {}
    const errors: string[] = []
    const bigcommerceService = new BigCommerceService()

    try {
      const brandService = new BrandService()
      const brandResult = await brandService.syncBrands()
      results.marcas = brandResult
      if (!brandResult.success) errors.push('Marcas: ' + (brandResult.message ?? 'fallo'))
      this.logger.info('Marcas sincronizadas')
    } catch (e: any) {
      this.logger.error({ err: e }, 'Error sincronizando marcas')
      errors.push('Marcas: ' + (e?.message ?? 'error'))
    }

    try {
      const categoryService = new CategoryService()
      const categoryResult = await categoryService.syncCategories()
      results.categorias = categoryResult
      this.logger.info('Categorias sincronizadas')
    } catch (e: any) {
      this.logger.error({ err: e }, 'Error sincronizando categorias')
      errors.push('Categorias: ' + (e?.message ?? 'error'))
    }

    try {
      const globalSyncService = new GlobalProductSyncService({
        calculation: new CalculationAdapter(),
      })
      const productResult = await globalSyncService.syncProductsComplete({
        skipPacks: true,
      })
      results.productos = productResult
      this.logger.info('Productos sincronizados')
    } catch (e: any) {
      this.logger.error({ err: e }, 'Error sincronizando productos')
      errors.push('Productos: ' + (e?.message ?? 'error'))
      const hooksEarly = new SyncWebhookNotifier()
      void hooksEarly
        .notifyAllChannelsInCountry('full_sync_completed', {
          success: false,
          source: 'full_sync',
          message: 'Sync completo detenido en productos',
          meta: { errors, stopped_at: 'productos' },
        })
        .catch((err) => this.logger.error({ err }, 'Webhook full_sync_completed (fallo productos)'))

      await new N8nAlertService().send('sync_completo:productos_fallidos', errors.join('; '), {
        stopped_at: 'productos',
        errors,
      })

      return response.status(500).json({
        success: false,
        message: 'Sincronizacion completa fallo en productos',
        data: results,
        errors,
        meta: { timestamp: new Date().toISOString(), version: 'full-sync' },
      })
    }

    try {
      const packsSyncService = new PacksSyncService(bigcommerceService)
      const packsResult = await packsSyncService.syncPacksFromBigcommerce()
      results.packs = packsResult
      this.logger.info('Packs sincronizados')
    } catch (e: any) {
      this.logger.error({ err: e }, 'Error sincronizando packs')
      errors.push('Packs: ' + (e?.message ?? 'error'))
    }

    try {
      const packReserveSyncService = new PackReserveSyncService(bigcommerceService)
      const reserveResult = await packReserveSyncService.syncPacksReserve()
      results.packs_reserva = reserveResult
      this.logger.info('Packs reserva sincronizados')
    } catch (e: any) {
      this.logger.error({ err: e }, 'Error sincronizando packs reserva')
      errors.push('Packs reserva: ' + (e?.message ?? 'error'))
    }

    try {
      const cache = new CacheService()
      await cache.invalidateByPrefix(syncConfig.cacheInvalidationPrefixProducts)
    } catch (e: any) {
      this.logger.warn({ err: e }, 'Invalidacion de cache Redis omitida')
    }

    if (errors.length > 0) {
      await new N8nAlertService().send('sync_completo:errores_parciales', errors.join('; '), {
        fases_con_error: errors.length,
      })
    }

    const hooks = new SyncWebhookNotifier()
    void hooks
      .notifyAllChannelsInCountry('full_sync_completed', {
        success: errors.length === 0,
        source: 'full_sync',
        message:
          errors.length === 0
            ? 'Sync completo finalizado'
            : 'Sync completo finalizado con errores en alguna fase',
        meta: {
          errors: errors.length > 0 ? errors : undefined,
        },
      })
      .catch((err) => this.logger.error({ err }, 'Webhook full_sync_completed'))

    return response.ok({
      success: errors.length === 0,
      message:
        errors.length > 0
          ? `Sincronizacion completada con errores: ${errors.join('; ')}`
          : 'Sincronizacion completa exitosa',
      data: results,
      errors: errors.length > 0 ? errors : undefined,
      meta: { timestamp: new Date().toISOString(), version: 'full-sync' },
    })
  }
}
