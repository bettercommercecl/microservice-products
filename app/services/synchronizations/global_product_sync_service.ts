import type { CalculationPort } from '#application/ports/calculation.port'
import syncConfig from '#config/sync'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import type { BigCommerceProduct } from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type {
  BatchResult,
  FormattedProductWithVariants,
  SyncEnrichmentData,
  SyncResult,
} from '#interfaces/product-sync/sync.interfaces'
import FiltersService from '#services/filters_service'
import FormatOptionsService from '#services/format_options_service'
import InventoryService from '#services/inventory_service'
import N8nReserveService from '#services/n8n_reserve_service'
import FormatVariantsService from '#services/synchronizations/format_variants_service'
import GlobalFormatProductsService from '#services/synchronizations/global_format_products_service'
import PacksSyncService from '#services/synchronizations/packs_sync_service'
import SyncCleanupService from '#services/synchronizations/sync_cleanup_service'
import SyncPersistenceService from '#services/synchronizations/sync_persistence_service'
import SyncPreloadService from '#services/synchronizations/sync_preload_service'
import env from '#start/env'
import { createBatches } from '#utils/env_parser'
import Logger from '@adonisjs/core/services/logger'

/**
 * Orquestador de la sincronizacion global de productos.
 * Responsabilidad unica: coordinar el flujo entre servicios especializados.
 * No contiene logica de formateo, persistencia ni limpieza.
 */
export default class GlobalProductSyncService {
  private readonly logger = Logger.child({ service: 'GlobalProductSyncService' })

  private readonly bigcommerceService: BigCommerceService
  private readonly inventoryService: InventoryService
  private readonly n8nReserveService: N8nReserveService
  private readonly formatProductsService: GlobalFormatProductsService
  private readonly formatVariantsService: FormatVariantsService
  private readonly formatOptionsService: FormatOptionsService
  private readonly persistenceService: SyncPersistenceService
  private readonly preloadService: SyncPreloadService
  private readonly cleanupService: SyncCleanupService
  private readonly filtersService: FiltersService

  private static readonly BATCH_SIZE = syncConfig.batchSize

  constructor(deps: { calculation: CalculationPort }) {
    this.bigcommerceService = new BigCommerceService()
    this.inventoryService = new InventoryService()
    this.n8nReserveService = new N8nReserveService()
    this.formatProductsService = new GlobalFormatProductsService({
      calculation: deps.calculation,
    })
    this.formatVariantsService = new FormatVariantsService({
      calculation: deps.calculation,
    })
    this.formatOptionsService = new FormatOptionsService()
    this.persistenceService = new SyncPersistenceService()
    this.preloadService = new SyncPreloadService()
    this.cleanupService = new SyncCleanupService()
    this.filtersService = new FiltersService()
  }

  /**
   * Flujo principal:
   * 1. Sincronizar inventario y reservas
   * 2. Obtener catalogo completo de BigCommerce
   * 3. Pre-cargar datos de enriquecimiento (reviews, timers)
   * 4. Formatear y persistir por lotes
   * 5. Limpiar productos descontinuados
   * 6. Sincronizar filtros (ID_ADVANCED debe estar configurado)
   * 7. Sincronizar packs (ID_PACKS debe estar configurado) si skipPacks es false
   */
  async syncProductsComplete(options?: { skipPacks?: boolean }): Promise<SyncResult> {
    const startTime = Date.now()
    this.logger.info('Iniciando sincronizacion global de productos...')

    try {
      // 1. Stock de seguridad y reservas n8n
      await this.syncInventoryAndReserves()

      // 2. Catalogo completo desde BigCommerce
      const products = await this.fetchAllProducts()
      if (products.length === 0) {
        return this.buildResponse(startTime, { products: 0, variants: 0, hidden: 0 }, 0)
      }
      // 3. Reviews y timers en batch para evitar N+1
      const enrichment = await this.preloadService.loadAll(products)

      // 4. Formatear y guardar por lotes
      const stats = await this.processAllBatches(products, enrichment)

      // 5. Ocultar descontinuados y limpiar huerfanos
      await this.cleanupService.run(products.map((p) => p.id))

      // 6. Poblar filters_products desde categorias
      await this.syncFilters()

      // 7. Sincronizar packs (omitir si skipPacks o sin config)
      if (!options?.skipPacks && env.get('ID_PACKS')) {
        const packsSyncService = new PacksSyncService(this.bigcommerceService)
        await packsSyncService.syncPacksFromBigcommerce()
      }

      return this.buildResponse(startTime, stats, stats.batches || 0)
    } catch (error: any) {
      this.logger.error(
        { error: error.message, stack: error.stack },
        'Error en sincronizacion de productos'
      )
      throw error
    }
  }

  // ================================================================
  // PASOS DEL FLUJO
  // ================================================================

  private async syncInventoryAndReserves(): Promise<void> {
    this.logger.info('Sincronizando inventario y reservas...')

    // Stock de seguridad desde BC -> catalog_safe_stock
    const inventoryResult = await this.inventoryService.syncSafeStock()
    if (inventoryResult && 'status' in inventoryResult && inventoryResult.status === 'Error') {
      const err = inventoryResult as {
        code?: string
        title?: string
        detail?: string
        httpStatus?: number
        bcResponse?: unknown
        dbError?: Record<string, unknown>
      }
      const detail = [err.title, err.detail, err.code, err.dbError?.message]
        .filter(Boolean)
        .join(' | ')
      const e = new Error(detail || 'Error al sincronizar stock de seguridad')
      ;(e as any).bcContext = {
        httpStatus: err.httpStatus,
        bcResponse: err.bcResponse,
        dbError: err.dbError,
      }
      throw e
    }

    // Reservas desde n8n -> inventory_reserve
    await this.n8nReserveService.fetchAndSaveReserves()
    // Cruce BC reserva con n8n -> actualiza bin_picking en catalog_safe_stock
    await this.inventoryService.syncReserveWithN8nCrossRef()

    this.logger.info('Inventario y reservas sincronizados')
  }

  private async fetchAllProducts(): Promise<BigCommerceProduct[]> {
    this.logger.info('Obteniendo catalogo completo de BigCommerce...')

    // Una sola llamada con todo incluido
    const result = await this.bigcommerceService.products.getAll({
      include: ['images', 'variants', 'channels'],
      availability: 'available',
      limit: 250,
    })

    const products = result.data || []
    this.logger.info({ total: products.length }, 'Catalogo obtenido')
    return products
  }

  private async processAllBatches(
    products: BigCommerceProduct[],
    enrichment: SyncEnrichmentData
  ): Promise<BatchResult & { batches: number }> {
    // Dividir en lotes de 200 para no saturar memoria ni DB
    const batches = createBatches(products, GlobalProductSyncService.BATCH_SIZE)
    let totalProducts = 0
    let totalVariants = 0
    let totalHidden = 0

    this.logger.info({ batches: batches.length }, 'Procesando lotes...')

    for (let i = 0; i < batches.length; i++) {
      const result = await this.processSingleBatch(batches[i], i, enrichment)
      totalProducts += result.products
      totalVariants += result.variants
      totalHidden += result.hidden

      this.logger.info(
        `Lote ${i + 1}/${batches.length}: ${result.products} productos, ${result.variants} variantes`
      )
    }

    return {
      products: totalProducts,
      variants: totalVariants,
      hidden: totalHidden,
      batches: batches.length,
    }
  }

  private async processSingleBatch(
    batch: BigCommerceProduct[],
    batchIndex: number,
    enrichment: SyncEnrichmentData
  ): Promise<BatchResult> {
    try {
      // Reservas por SKU para este lote
      const allSkus = this.collectSkus(batch)
      const reservesMap = await this.n8nReserveService.getReservesBySkus(allSkus)

      // Productos con precios, imagenes, flags de categoria, reviews, timer
      const formattedProducts = await this.formatProductsService.formatProducts(
        batch,
        reservesMap,
        enrichment.reviewsMap,
        enrichment.timerMap
      )

      // Variantes con stock, precios, imagenes
      const productsWithVariants = await this.formatVariantsService.formatVariants(
        formattedProducts,
        reservesMap
      )

      // Ocultar productos cuyas variantes tienen precio 0
      const hidden = this.hideProductsWithoutValidVariants(productsWithVariants)

      // Opciones (talla, color, etc.) por variante
      const options = await this.formatOptionsService.formatOptions(
        productsWithVariants.map((p) => ({
          product_id: p.id,
          id: p.id,
          variants: p.variants,
        })) as any
      )

      // Guardar todo en una transaccion: products, variants, categories, channels, options
      await this.persistenceService.saveBatch(productsWithVariants, options)

      return {
        products: batch.length,
        variants: batch.reduce((sum, p) => sum + (p.variants?.length || 0), 0),
        hidden,
      }
    } catch (error: any) {
      this.logger.error({ error: error.message, batch: batchIndex + 1 }, 'Error en lote')
      throw error
    }
  }

  // ================================================================
  // SINCRONIZACION DE FILTROS
  // ================================================================

  /**
   * Sincroniza filters_products desde category_products.
   * Solo ejecuta si ID_ADVANCED (categoria raiz Filtros) esta configurado.
   */
  private async syncFilters(): Promise<void> {
    const idAdvanced = env.get('ID_ADVANCED')
    if (!idAdvanced || idAdvanced.trim() === '') {
      this.logger.info('ID_ADVANCED no configurado, omitiendo sync de filtros')
      return
    }

    // Productos en categorias hijas de Filtros -> filters_products
    this.logger.info('Sincronizando filtros de productos...')
    try {
      const result = await this.filtersService.syncFiltersProducts()
      if (result.success) {
        this.logger.info({ message: result.message }, 'Filtros sincronizados')
      } else {
        this.logger.warn({ message: result.message }, 'Sync de filtros con advertencias')
      }
    } catch (error: any) {
      this.logger.error({ error: error.message }, 'Error al sincronizar filtros')
      throw error
    }
  }

  // ================================================================
  // REGLAS DE NEGOCIO (propias del orquestador)
  // ================================================================

  /**
   * Si TODAS las variantes de un producto tienen precios en 0,
   * el producto padre se oculta.
   */
  private hideProductsWithoutValidVariants(products: FormattedProductWithVariants[]): number {
    let hidden = 0

    for (const product of products) {
      if (product.variants.length === 0) continue

      const hasValid = product.variants.some((v) => v.normal_price > 0 || v.discount_price > 0)

      if (!hasValid) {
        product.is_visible = false
        hidden++
      }
    }

    return hidden
  }

  // ================================================================
  // UTILIDADES
  // ================================================================

  /** SKUs del producto padre y de cada variante para buscar reservas */
  private collectSkus(products: BigCommerceProduct[]): string[] {
    const skus: string[] = []
    for (const product of products) {
      skus.push(product.sku)
      for (const variant of product.variants || []) {
        skus.push(variant.sku)
      }
    }
    return skus
  }

  /** Arma la respuesta final con totales y tiempo */
  private buildResponse(
    startTime: number,
    stats: { products: number; variants: number; hidden: number },
    totalBatches: number
  ): SyncResult {
    const totalTime = Date.now() - startTime
    this.logger.info(`Sincronizacion de productos completada en ${totalTime}ms`)

    return {
      success: true,
      message: 'Sincronizacion global de productos completada',
      data: {
        timestamp: new Date().toISOString(),
        processed: {
          products: stats.products,
          variants: stats.variants,
          batches: totalBatches,
          hidden: stats.hidden,
          totalTime: `${totalTime}ms`,
        },
      },
    }
  }
}
