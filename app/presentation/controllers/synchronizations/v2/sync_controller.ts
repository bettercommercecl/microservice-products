import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import BrandService from '#services/brands_service'
import CategoryService from '#services/categories_service'
import GlobalProductSyncService from '#services/synchronizations/global_product_sync_service'
import PackReserveSyncService from '#services/synchronizations/pack_reserve_sync_service'
import PacksSyncService from '#services/synchronizations/packs_sync_service'
import StockSyncService from '#services/synchronizations/stock_sync_service'
import CacheService from '#services/cache_service'
import syncConfig from '#config/sync'
import env from '#start/env'
import ChannelRepository from '#infrastructure/persistence/repositories/channel_repository'
import SyncChannelsFromConfigUseCase from '#application/use_cases/channels/sync_channels_from_config_use_case'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

/**
 * Sincronizaciones v2: endpoints individuales (marcas, categorias, productos, packs, packs reserva, stock).
 */
export default class SyncControllerV2 {
  private readonly logger = Logger.child({ service: 'SyncControllerV2' })

  async syncBrands({ response }: HttpContext) {
    this.logger.info('Sincronizacion de marcas solicitada')
    const brandService = new BrandService()
    const result = await brandService.syncBrands()
    return response.ok({
      success: result.success,
      message: result.message,
      data: result.data,
      meta: { timestamp: new Date().toISOString(), version: 'brands-sync' },
      errors: result.errors,
    })
  }

  async syncCategories({ response }: HttpContext) {
    this.logger.info('Sincronizacion de categorias solicitada')
    const categoryService = new CategoryService()
    const result = await categoryService.syncCategories()
    return response.ok({
      success: true,
      message: result.message,
      data: result.data,
      meta: { timestamp: new Date().toISOString(), version: 'categories-sync' },
    })
  }

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
    return response.ok({
      success: true,
      message: 'Stock sincronizado',
      data: result,
      meta: { timestamp: new Date().toISOString(), version: 'stock-sync' },
    })
  }
}
