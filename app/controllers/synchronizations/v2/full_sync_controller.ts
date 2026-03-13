import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import BrandService from '#services/brands_service'
import CategoryService from '#services/categories_service'
import CompleteSyncService from '#services/synchronizations/complete_sync_service'
import PackReserveSyncService from '#services/synchronizations/pack_reserve_sync_service'
import PacksSyncService from '#services/synchronizations/packs_sync_service'
import CacheService from '#services/cache_service'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

/**
 * Orquesta la sincronizacion completa v2: marcas -> categorias -> productos -> packs -> packs reserva.
 */
export default class FullSyncController {
  private readonly logger = Logger.child({ service: 'FullSyncController' })

  async syncFull({ response }: HttpContext) {
    this.logger.info('Sincronizacion completa solicitada: marcas -> categorias -> productos -> packs -> packs reserva')

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
      const completeSyncService = new CompleteSyncService()
      const productResult = await completeSyncService.syncProductsComplete({
        skipPacks: true,
      })
      results.productos = productResult
      this.logger.info('Productos sincronizados')
    } catch (e: any) {
      this.logger.error({ err: e }, 'Error sincronizando productos')
      errors.push('Productos: ' + (e?.message ?? 'error'))
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
      await cache.invalidateByPrefix('products')
    } catch (e: any) {
      this.logger.warn({ err: e }, 'Invalidacion de cache Redis omitida')
    }

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
