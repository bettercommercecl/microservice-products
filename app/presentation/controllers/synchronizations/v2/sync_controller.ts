import SyncChannelsFromConfigUseCase from '#application/use_cases/channels/sync_channels_from_config_use_case'
import syncConfig from '#config/sync'
import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import ChannelRepository from '#infrastructure/persistence/repositories/channel_repository'
import CacheService from '#services/cache_service'
import GlobalProductSyncService from '#services/synchronizations/global_product_sync_service'
import PackReserveSyncService from '#services/synchronizations/pack_reserve_sync_service'
import PacksSyncService from '#services/synchronizations/packs_sync_service'
import SearchIndexRefreshNotifier from '#services/synchronizations/search_index_refresh_notifier'
import StockSyncService from '#services/synchronizations/stock_sync_service'
import SyncWebhookNotifier from '#services/synchronizations/sync_webhook_notifier'
import env from '#start/env'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

/**
 * Sincronizaciones v2: endpoints individuales (canales, productos, packs, packs reserva, stock).
 * Marcas y categorias: mismas rutas legacy en `start/routes/sync.ts` (`api/sincronizar-marcas`, `api/sincronizar-categorias`).
 */
export default class SyncControllerV2 {
  private readonly logger = Logger.child({ service: 'SyncControllerV2' })

  async syncChannels({ response }: HttpContext) {
    this.logger.info('Sincronizacion de canales solicitada (v2)')
    const countryCode = env.get('COUNTRY_CODE')
    const useCase = new SyncChannelsFromConfigUseCase(new ChannelRepository())
    const result = await useCase.execute(countryCode)
    return response.ok({
      success: true,
      message: 'Sincronizacion de canales completada',
      data: result,
      meta: { timestamp: new Date().toISOString(), version: 'channels-sync', countryCode },
    })
  }

  async syncProducts({ response }: HttpContext) {
    this.logger.info('Sincronizacion global de productos solicitada')
    const syncService = new GlobalProductSyncService({
      calculation: new CalculationAdapter(),
    })
    const result = await syncService.syncProductsComplete()
    try {
      const cache = new CacheService()
      await cache.invalidateByPrefix(syncConfig.cacheInvalidationPrefixProducts)
    } catch (e: any) {
      this.logger.warn({ err: e }, 'Invalidacion de cache Redis omitida')
    }

    const hooks = new SyncWebhookNotifier()
    void hooks
      .notifyAllChannelsInCountry('products_sync_completed', {
        success: result.success,
        source: 'standalone',
        message: 'Productos sincronizados (global)',
      })
      .catch((err) => this.logger.error({ err }, 'Webhook products_sync_completed (global)'))

    new SearchIndexRefreshNotifier().scheduleRefreshAllInBackground()

    return response.ok({
      success: result.success,
      message: result.message,
      data: result.data,
      meta: { timestamp: new Date().toISOString(), version: 'product-sync' },
    })
  }

  async syncPacks({ response }: HttpContext) {
    this.logger.info('Sincronizacion de packs solicitada')
    const bigcommerceService = new BigCommerceService()
    const packsSyncService = new PacksSyncService(bigcommerceService)
    const result = await packsSyncService.syncPacksFromBigcommerce()
    const status = result.status === 201 ? 200 : result.status
    const packOk = result.status < 400
    const hooks = new SyncWebhookNotifier()
    void hooks
      .notifyAllChannelsInCountry('packs_sync_completed', {
        success: packOk,
        source: 'standalone',
        message: 'Packs sincronizados desde BigCommerce',
      })
      .catch((err) => this.logger.error({ err }, 'Webhook packs_sync_completed'))

    new SearchIndexRefreshNotifier().scheduleRefreshAllInBackground()

    return response.status(status).json({
      success: result.status < 400,
      message: result.message ?? (result.status === 201 ? 'Packs sincronizados' : 'Sin packs'),
      data: result.data,
      meta: { timestamp: new Date().toISOString(), version: 'packs-sync' },
    })
  }

  async syncPacksReserve({ response }: HttpContext) {
    this.logger.info('Sincronizacion de packs reserva solicitada')
    const bigcommerceService = new BigCommerceService()
    const packReserveSyncService = new PackReserveSyncService(bigcommerceService)
    const result = await packReserveSyncService.syncPacksReserve()
    const hooks = new SyncWebhookNotifier()
    void hooks
      .notifyAllChannelsInCountry('packs_reserve_sync_completed', {
        success: true,
        source: 'standalone',
        message: 'Packs reserva sincronizados',
      })
      .catch((err) => this.logger.error({ err }, 'Webhook packs_reserve_sync_completed'))

    new SearchIndexRefreshNotifier().scheduleRefreshAllInBackground()

    return response.ok({
      success: true,
      message: 'Packs reserva sincronizados',
      data: result,
      meta: { timestamp: new Date().toISOString(), version: 'packs-reserve-sync' },
    })
  }

  async syncStock({ response }: HttpContext) {
    this.logger.info('Sincronizacion de stock solicitada')
    const bigcommerceService = new BigCommerceService()
    const stockSyncService = new StockSyncService(bigcommerceService)
    const result = await stockSyncService.syncStock()
    const hooks = new SyncWebhookNotifier()
    void hooks
      .notifyAllChannelsInCountry('stock_sync_completed', {
        success: true,
        source: 'standalone',
        message: 'Stock sincronizado',
      })
      .catch((err) => this.logger.error({ err }, 'Webhook stock_sync_completed'))

    new SearchIndexRefreshNotifier().scheduleRefreshAllInBackground()

    return response.ok({
      success: true,
      message: 'Stock sincronizado',
      data: result,
      meta: { timestamp: new Date().toISOString(), version: 'stock-sync' },
    })
  }
}
