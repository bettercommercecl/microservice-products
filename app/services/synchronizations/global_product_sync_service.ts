import type { CalculationPort } from '#application/ports/calculation.port'
import syncConfig from '#config/sync'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import type { PriceListRecord } from '#infrastructure/bigcommerce/modules/pricelists/interfaces/pricelist_record.interface'
import type { BigCommerceProduct } from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type {
  BatchResult,
  FormattedProductWithVariants,
  SyncEnrichmentData,
  SyncProductsCompleteOptions,
  SyncResult,
} from '#interfaces/product-sync/sync.interfaces'
import Channel from '#models/channel'
import FiltersService from '#services/filters_service'
import FormatOptionsService from '#services/format_options_service'
import InventoryService from '#services/inventory_service'
import N8nReserveService from '#services/n8n_reserve_service'
import ProductService from '#services/product_service'
import FormatVariantsService from '#services/synchronizations/format_variants_service'
import GlobalFormatProductsService from '#services/synchronizations/global_format_products_service'
import PacksSyncService from '#services/synchronizations/packs_sync_service'
import PricelistRecordsBatchService, {
  filterProductsByPricelistMembership,
  getListPriceIdForCountry,
} from '#services/synchronizations/pricelist_records_batch_service'
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
  private readonly productService?: ProductService

  private static readonly BATCH_SIZE = syncConfig.batchSize

  constructor(deps: { calculation: CalculationPort; productService?: ProductService }) {
    this.productService = deps.productService
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
   * 3. (No-CL) Price list completo BC, filtrar catalogo por variantes en lista, purgar excluidos en DB
   * 4. Pre-cargar enriquecimiento (reviews, timers) solo sobre productos que pasan el filtro
   * 5. Formatear y persistir por lotes
   * 6. Limpiar productos descontinuados (ya no en catalogo BC)
   * 7. Sincronizar filtros (ID_ADVANCED debe estar configurado)
   * 8. Sincronizar packs (ID_PACKS debe estar configurado) si skipPacks es false
   *
   * Modo canal: `channelId` + `productService`; IDs por canal BC; detalle con `categories:in` solo si
   * `channels.parent_category` en BD esta definido (fuente de verdad). Sin filtro post-fetch.
   * Limpieza: cleanupAfterChannelSync (no run global).
   */
  async syncProductsComplete(options?: SyncProductsCompleteOptions): Promise<SyncResult> {
    const startTime = Date.now()
    const channelId = options?.channelId
    const channelName = options?.channelName
    const isChannelMode = channelId !== undefined

    if (isChannelMode) {
      this.logger.info(
        { channelId, channelName },
        'Iniciando sincronizacion de productos (modo canal)'
      )
    } else {
      this.logger.info('Iniciando sincronizacion global de productos...')
    }

    try {
      // 1. Stock de seguridad y reservas n8n
      await this.syncInventoryAndReserves()

      // 2. Catalogo desde BigCommerce (global o filtrado por canal)
      let products: BigCommerceProduct[]
      if (isChannelMode) {
        if (!this.productService) {
          throw new Error('ProductService es obligatorio para syncProductsComplete en modo canal')
        }
        products = await this.fetchProductsByChannel(channelId!)
      } else {
        products = await this.fetchAllProducts()
      }

      if (products.length === 0) {
        return this.buildResponse(
          startTime,
          { products: 0, variants: 0, hidden: 0 },
          0,
          isChannelMode ? { channelId: channelId!, channelName } : undefined
        )
      }

      const totalFetchedFromBc = products.length

      // 3. Price list del pais + filtro + purga (sin variante en lista = no se procesa ni queda en BD como activo)
      if (env.get('COUNTRY_CODE') !== 'CL') {
        const priceListId = getListPriceIdForCountry()
        const pricelistService = new PricelistRecordsBatchService(this.bigcommerceService)
        await pricelistService.syncFullPricelistFromBigcommerce(priceListId)
        const variantIdsInList = await pricelistService.getVariantIdsInPriceList(priceListId)
        const { kept, excludedIds } = filterProductsByPricelistMembership(
          products,
          variantIdsInList
        )
        products = kept
        await this.cleanupService.purgeExcludedFromPricelist(excludedIds, totalFetchedFromBc)
        this.logger.info(
          {
            total_bc: totalFetchedFromBc,
            synced: products.length,
            excluded: excludedIds.length,
          },
          'Catalogo filtrado por price list del pais'
        )
        if (products.length === 0) {
          return this.buildResponse(
            startTime,
            { products: 0, variants: 0, hidden: 0 },
            0,
            isChannelMode ? { channelId: channelId!, channelName } : undefined
          )
        }
      }

      // 4. Reviews y timers en batch (solo productos que se sincronizaran)
      const enrichment = await this.preloadService.loadAll(products)

      // 5. Formatear y guardar por lotes
      const stats = await this.processAllBatches(products, enrichment)

      // 6. Limpieza: global = obsoletos vs catalogo BC; canal = solo vínculos de ese canal + huérfanos
      let channelCleanup: { staleLinksRemoved: number; orphansRemoved: number } | undefined
      if (isChannelMode) {
        channelCleanup = await this.cleanupService.cleanupAfterChannelSync(
          channelId!,
          products.map((p) => p.id)
        )
      } else {
        await this.cleanupService.run(products.map((p) => p.id))
      }

      // 7. Poblar filters_products desde categorias
      if (!options?.skipFilters) {
        await this.syncFilters()
      }

      // 8. Sincronizar packs (omitir si skipPacks o sin config)
      if (!options?.skipPacks && env.get('ID_PACKS')) {
        const packsSyncService = new PacksSyncService(this.bigcommerceService)
        await packsSyncService.syncPacksFromBigcommerce()
      }

      return this.buildResponse(
        startTime,
        stats,
        stats.batches || 0,
        isChannelMode ? { channelId: channelId!, channelName, channelCleanup } : undefined
      )
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

  /**
   * Fuera de Chile: mapa de precios del lote leido solo desde pricelist_variant_records
   * (el sync completo del price list ya corrio antes de procesar lotes).
   */
  private async loadBcPricelistOptionsForBatch(
    batch: BigCommerceProduct[]
  ): Promise<{ bcPriceListByVariantId: Map<number, PriceListRecord> } | undefined> {
    if (env.get('COUNTRY_CODE') === 'CL') {
      return undefined
    }

    const variantIds = batch.flatMap((p) => (p.variants || []).map((v) => v.id))
    const priceListId = getListPriceIdForCountry()
    const bcPriceListByVariantId = await new PricelistRecordsBatchService(
      this.bigcommerceService
    ).loadMapFromDbForVariantIds(priceListId, variantIds)

    return { bcPriceListByVariantId }
  }

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

  /**
   * IDs por canal BC (getProductsByChannel) + detalle por lotes.
   * `channels.parent_category` en BD define si getDetailedByIds agrega `categories:in`; si es null, solo ids de canal.
   */
  private async fetchProductsByChannel(channelId: number): Promise<BigCommerceProduct[]> {
    const channelRow = await Channel.find(channelId)
    if (!channelRow) {
      throw new Error(
        `Sync por canal: no hay fila en channels para channelId=${channelId}. Sincroniza o crea el canal en BD antes de ejecutar.`
      )
    }
    const parentCategory = channelRow.parent_category ?? null

    this.logger.info(
      { channelId, parent_category: parentCategory },
      'Obteniendo catalogo BigCommerce por canal (fuente parent_category: tabla channels)'
    )

    const productIds = await this.productService!.getAllProductIdsByChannel(channelId)
    if (productIds.length === 0) {
      this.logger.warn({ channelId }, 'No hay productos asignados al canal en BC')
      return []
    }

    const batchSize = 250
    const batches: number[][] = []
    for (let i = 0; i < productIds.length; i += batchSize) {
      batches.push(productIds.slice(i, i + batchSize))
    }

    const batchPromises = batches.map(async (batchIds, index) => {
      try {
        const productsPerPage = await this.bigcommerceService.getAllProductsRefactoring(
          batchIds,
          0,
          parentCategory
        )
        this.logger.info(
          { batch: index + 1, total: batches.length, count: productsPerPage.data?.length ?? 0 },
          'Lote BC por canal'
        )
        return productsPerPage.data || []
      } catch (error: any) {
        this.logger.error(
          { error: error.message, batch: index + 1 },
          'Error en lote fetch por canal'
        )
        return []
      }
    })

    const batchResults = await Promise.all(batchPromises)
    const allProducts = batchResults.flat()
    const uniqueProducts = allProducts.filter(
      (product, index, self) => index === self.findIndex((p) => p.id === product.id)
    )

    this.logger.info(
      { total: uniqueProducts.length, expected: productIds.length },
      'Productos unicos obtenidos por canal'
    )

    return uniqueProducts as BigCommerceProduct[]
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

      const bcPriceOptions = await this.loadBcPricelistOptionsForBatch(batch)

      // Productos con precios, imagenes, flags de categoria, reviews, timer
      const formattedProducts = await this.formatProductsService.formatProducts(
        batch,
        reservesMap,
        enrichment.reviewsMap,
        enrichment.timerMap,
        bcPriceOptions
      )

      // Variantes con stock, precios, imagenes
      const productsWithVariants = await this.formatVariantsService.formatVariants(
        formattedProducts,
        reservesMap,
        bcPriceOptions
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
    totalBatches: number,
    channelMeta?: {
      channelId: number
      channelName?: string
      channelCleanup?: { staleLinksRemoved: number; orphansRemoved: number }
    }
  ): SyncResult {
    const totalTime = Date.now() - startTime
    this.logger.info(`Sincronizacion de productos completada en ${totalTime}ms`)

    const isChannel = channelMeta !== undefined

    return {
      success: true,
      message: isChannel
        ? `Sincronizacion de productos completada (canal ${channelMeta.channelId})`
        : 'Sincronizacion global de productos completada',
      data: {
        timestamp: new Date().toISOString(),
        processed: {
          products: stats.products,
          variants: stats.variants,
          batches: totalBatches,
          hidden: stats.hidden,
          totalTime: `${totalTime}ms`,
        },
        ...(isChannel && {
          mode: 'channel' as const,
          channelId: channelMeta.channelId,
          channelName: channelMeta.channelName,
          ...(channelMeta.channelCleanup && { channelCleanup: channelMeta.channelCleanup }),
        }),
        ...(!isChannel && { mode: 'global' as const }),
      },
    }
  }
}
