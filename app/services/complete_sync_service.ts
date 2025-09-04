import Logger from '@adonisjs/core/services/logger'
import BigcommerceService from '#services/bigcommerce_service'
import env from '#start/env'
import type { BigcommerceProduct } from '#dto/bigcommerce/bigcommerce_product.dto'
import { ChannelConfigInterface } from '#interfaces/channel_interface'
import InventoryService from './inventory_service.js'
import FormatProductsService from './format_products_service.js'
import FormatVariantsService from './format_variants_service.js'
import FormatOptionsService from './format_options_service.js'
import FiltersService from './filters_service.js'
import CategoryService from './categories_service.js'
import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'
import Product from '#models/product'
import Variant from '#models/variant'
import Option from '#models/option'
import CategoryProduct from '#models/category_product'
import FiltersProduct from '#models/filters_product'
import ChannelProduct from '#models/channel_product'
import pLimit from 'p-limit'
import ChannelsService from './channels_service.js'

export default class CompleteSyncService {
  private readonly logger = Logger.child({ service: 'CompleteSyncService' })
  private readonly bigcommerceService: BigcommerceService
  private readonly currentChannelConfig: ChannelConfigInterface
  private readonly formatProductsService: FormatProductsService
  private readonly inventoryService: InventoryService
  private readonly formatVariantsService: FormatVariantsService
  private readonly formatOptionsService: FormatOptionsService
  private readonly filtersService: FiltersService
  private readonly categoryService: CategoryService
  private readonly channelsService: ChannelsService

  constructor(currentChannelConfig: ChannelConfigInterface) {
    this.bigcommerceService = new BigcommerceService()
    this.formatProductsService = new FormatProductsService()
    this.formatVariantsService = new FormatVariantsService()
    this.formatOptionsService = new FormatOptionsService()
    this.filtersService = new FiltersService()
    this.categoryService = new CategoryService()
    this.inventoryService = new InventoryService()
    this.currentChannelConfig = currentChannelConfig
    this.channelsService = new ChannelsService()
  }

  /**
   * 🔄 Sincronización Completa de Productos
   */
  async syncProductsComplete(): Promise<{
    success: boolean
    message: string
    data: {
      timestamp: string
      channelId: number
      channelName: string
      statistics: {
        before: {
          products: number
          variants: number
          categories: number
          options: number
          filters: number
        }
        after: {
          products: number
          variants: number
          categories: number
          options: number
          filters: number
        }
        changes: {
          productsAdded: number
          productsRemoved: number
          variantsAdded: number
          variantsRemoved: number
          categoriesAdded: number
          categoriesRemoved: number
          optionsAdded: number
          optionsRemoved: number
          filtersAdded: number
          filtersRemoved: number
        }
      }
    }
  }> {
    const { CHANNEL, API_URL } = this.currentChannelConfig
    // 🎯 Obtener el país configurado
    const configuredCountry = env.get('COUNTRY_CODE')
    this.logger.info(`🌍 País configurado en variables de entorno: ${configuredCountry}`)
    this.logger.info(`🔄 Iniciando sincronización completa para: ${API_URL}`)

    // ============================================================================
    // PASO 0: CAPTURAR ESTADO INICIAL (SNAPSHOT) ANTES DE LA SINCRONIZACIÓN
    // ============================================================================
    this.logger.info(`📸 Capturando estado inicial del canal ${CHANNEL}...`)
    const initialState = await this.captureInitialState(CHANNEL)
    const beforeStats = await this.getChannelStatistics(CHANNEL)

    this.logger.info(`📸 Estado inicial capturado:`)
    this.logger.info(`  - Productos: ${beforeStats.products}`)
    this.logger.info(`  - Variantes: ${beforeStats.variants}`)
    this.logger.info(`  - Categorías: ${beforeStats.categories}`)
    this.logger.info(`  - Opciones: ${beforeStats.options}`)
    this.logger.info(`  - Filtros: ${beforeStats.filters}`)

    try {
      // 1. Obtener actualizar o crear inventario
      const inventoryResult = await this.inventoryService.syncSafeStock()
      if (inventoryResult && 'status' in inventoryResult && inventoryResult.status === 'Error') {
        this.logger.error('❌ Error en sincronización de stock de seguridad')
        throw new Error('Error al sincronizar el stock de seguridad')
      }
      // 2. Obtener productos de Bigcommerce
      const bigcommerceProducts = await this.fetchBigcommerceProducts(CHANNEL)
      this.logger.info(`📦 Obtenidos ${bigcommerceProducts.length} productos de Bigcommerce`)

      // ============================================================================
      // PASO 3: PROCESAR PRODUCTOS POR LOTES PARA EVITAR SOBRECARGA DE API
      // ============================================================================
      const BATCH_SIZE = 50 // Procesar 50 productos a la vez
      const allFormattedVariants: FormattedProductWithModelVariants[] = []

      for (let i = 0; i < bigcommerceProducts.length; i += BATCH_SIZE) {
        const batch = bigcommerceProducts.slice(i, i + BATCH_SIZE)
        this.logger.info(
          `🔄 Procesando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(bigcommerceProducts.length / BATCH_SIZE)} (${batch.length} productos)`
        )

        // Formatear productos del lote
        const formattedProducts = await this.formatProductsService.formatProducts(
          batch,
          this.currentChannelConfig
        )

        // Formatear variantes del lote
        const formattedVariants = await this.formatVariantsService.formatVariants(
          formattedProducts,
          this.currentChannelConfig
        )

        // Agregar al resultado total
        allFormattedVariants.push(...formattedVariants)

        this.logger.info(
          `✅ Lote ${Math.floor(i / BATCH_SIZE) + 1} completado: ${formattedVariants.length} productos formateados`
        )
      }

      this.logger.info(`✅ Total productos formateados: ${allFormattedVariants.length}`)

      // ============================================================================
      // PASO 4: GUARDAR TODOS LOS PRODUCTOS Y VARIANTES
      // ============================================================================
      this.logger.info(`💾 Guardando productos y variantes...`)
      await this.saveProductsAndVariants(allFormattedVariants)
      // ============================================================================
      // PASO 5: GUARDAR RELACION DE PRODUCTOS POR CANAL
      // ============================================================================
      this.logger.info(`💾 Guardando relación de productos por canal...`)
      await this.channelsService.syncChannelByProduct(
        allFormattedVariants,
        this.currentChannelConfig.CHANNEL
      )

      // ============================================================================
      // PASO 6: SINCRONIZAR OPCIONES DE PRODUCTOS
      // ============================================================================
      this.logger.info(`💾 Guardando opciones de productos...`)
      await this.syncOptions(allFormattedVariants)

      // ============================================================================
      // PASO 7: SINCRONIZAR RELACIONES PRODUCTO-CATEGORÍA
      // ============================================================================
      this.logger.info(`🔗 Sincronizando relaciones producto-categoría...`)
      await this.syncProductCategories(allFormattedVariants)

      // ============================================================================
      // PASO 8: SINCRONIZAR FILTROS DE PRODUCTOS
      // ============================================================================
      this.logger.info(`🔍 Sincronizando filtros de productos...`)
      await this.syncFilters()

      // ============================================================================
      // PASO 9: LIMPIEZA DE RELACIONES HUÉRFANAS (EN BACKGROUND)
      // ============================================================================
      this.logger.info(`🧹 Iniciando limpieza de relaciones huérfanas...`)
      // Ejecutar en background para no bloquear la respuesta
      setImmediate(() => this.cleanupOrphanedRelations(CHANNEL, initialState))

      // ============================================================================
      // PASO 10: CAPTURAR ESTADÍSTICAS FINALES Y CALCULAR CAMBIOS
      // ============================================================================
      this.logger.info(`📊 Capturando estadísticas finales...`)
      const afterStats = await this.getChannelStatistics(CHANNEL)
      const changes = this.calculateChanges(beforeStats, afterStats)

      this.logger.info(`📊 Estadísticas finales:`)
      this.logger.info(
        `  - Productos: ${afterStats.products} (${changes.productsAdded > 0 ? '+' : ''}${changes.productsAdded})`
      )
      this.logger.info(
        `  - Variantes: ${afterStats.variants} (${changes.variantsAdded > 0 ? '+' : ''}${changes.variantsAdded})`
      )
      this.logger.info(
        `  - Categorías: ${afterStats.categories} (${changes.categoriesAdded > 0 ? '+' : ''}${changes.categoriesAdded})`
      )
      this.logger.info(
        `  - Opciones: ${afterStats.options} (${changes.optionsAdded > 0 ? '+' : ''}${changes.optionsAdded})`
      )
      this.logger.info(
        `  - Filtros: ${afterStats.filters} (${changes.filtersAdded > 0 ? '+' : ''}${changes.filtersAdded})`
      )

      return {
        success: true,
        message: `Sincronización completada exitosamente para canal ${CHANNEL}`,
        data: {
          timestamp: new Date().toISOString(),
          channelId: CHANNEL,
          channelName: String(this.currentChannelConfig.CHANNEL || 'Unknown'),
          statistics: {
            before: beforeStats,
            after: afterStats,
            changes,
          },
        },
      }
    } catch (error) {
      this.logger.error(`❌ Error en sincronización de productos:`, error)
      throw error
    }
  }

  /**
   * 🔍 Obtener productos de Bigcommerce con estrategia de batching
   */
  private async fetchBigcommerceProducts(channelId: number): Promise<BigcommerceProduct[]> {
    this.logger.info(`🔍 Obteniendo productos de Bigcommerce para canal ${channelId}...`)

    try {
      // ============================================================================
      // PASO 1: OBTENER TODOS LOS PRODUCTOS POR CANAL (CON PAGINACIÓN)
      // ============================================================================
      this.logger.info(`📋 Obteniendo todos los productos por canal con paginación...`)

      // 🔍 DEBUG: Verificar qué devuelve getProductsByChannel directamente
      this.logger.info(`🔍 DEBUG - Llamando a getProductsByChannel...`)
      const directResponse = await this.bigcommerceService.getProductsByChannel(channelId)
      this.logger.info(
        `🔍 DEBUG - Respuesta directa de getProductsByChannel: ${directResponse.data?.length || 0} productos`
      )
      this.logger.info(`🔍 DEBUG - Metadata de paginación:`, directResponse.meta)

      this.logger.info(`🔍 DEBUG - Llamando a getAllProductIdsByChannel...`)
      const productIds = await this.getAllProductIdsByChannel(channelId)
      const totalProducts = productIds.length

      this.logger.info(`📦 Total de productos en API: ${totalProducts}`)

      if (totalProducts === 0) {
        this.logger.warn(`⚠️ No hay productos asignados al canal ${channelId}`)
        return []
      }

      // ============================================================================
      // PASO 2: DIVIDIR EN BATCHES DE 250
      // ============================================================================
      const batchSize = 250
      let batches: number[][] = []
      for (let i = 0; i < productIds.length; i += batchSize) {
        const batch = productIds.slice(i, i + batchSize)
        batches.push(batch)
      }

      this.logger.info(`📦 Dividido en ${batches.length} batches de máximo ${batchSize} productos`)
      this.logger.info(`🏷️ Usando PARENT_CATEGORY: ${this.currentChannelConfig.PARENT_CATEGORY}`)

      // ============================================================================
      // PASO 3: CONSULTAR INFORMACIÓN DETALLADA EN PARALELO
      // ============================================================================
      this.logger.info(`🚀 Procesando ${batches.length} batches en paralelo...`)

      const batchPromises = batches.map(async (batchIds, index) => {
        try {
          this.logger.info(
            `🔍 Procesando batch ${index + 1}/${batches.length} con ${batchIds.length} productos`
          )

          const productsPerPage = await this.bigcommerceService.getAllProductsRefactoring(
            batchIds,
            0, // visible = 0 (todos los productos)
            this.currentChannelConfig.PARENT_CATEGORY // parentCategory del canal
          )

          this.logger.info(
            `✅ Batch ${index + 1} completado: ${productsPerPage.data?.length || 0} productos`
          )
          return productsPerPage.data || []
        } catch (error) {
          this.logger.error(`❌ Error en batch ${index + 1}:`, error)
          return []
        }
      })

      // Esperar a que todas las promesas se resuelvan
      const batchResults = await Promise.all(batchPromises)

      // 🔍 DEBUG: Verificar resultados de batches
      this.logger.info(`🔍 DEBUG - Total batches procesados: ${batchResults.length}`)
      this.logger.info(
        `🔍 DEBUG - Productos por batch:`,
        batchResults.map((batch, index) => `Batch ${index + 1}: ${batch.length} productos`)
      )

      // ============================================================================
      // PASO 4: CONCATENAR RESULTADOS Y LIMPIAR
      // ============================================================================
      // Concatenar los resultados de los lotes en un solo array
      const allProducts = batchResults.flat()
      // Eliminar duplicados por ID
      const uniqueProducts = allProducts.filter(
        (product, index, self) => index === self.findIndex((p) => p.id === product.id)
      )

      this.logger.info(`📊 Productos únicos obtenidos: ${uniqueProducts.length}`)
      this.logger.info(
        `📊 Productos duplicados eliminados: ${allProducts.length - uniqueProducts.length}`
      )

      // Verificación final
      const finalCount = uniqueProducts.length
      const expectedTotal = productIds.length
      const percentage = ((finalCount / expectedTotal) * 100).toFixed(1)

      this.logger.info(
        `📊 Verificación final: ${finalCount} de ${expectedTotal} productos procesados (${percentage}%)`
      )

      if (finalCount < expectedTotal) {
        const missingCount = expectedTotal - finalCount
        this.logger.warn(`⚠️ ${missingCount} productos no pudieron ser obtenidos`)
      }

      return uniqueProducts
    } catch (error) {
      this.logger.error(`❌ Error obteniendo productos de Bigcommerce:`, error)
      throw error
    }
  }

  /**
   * 🔍 Obtiene todos los IDs de productos asignados a un canal, recorriendo todas las páginas
   */
  private async getAllProductIdsByChannel(channelId: number, limit = 200): Promise<number[]> {
    this.logger.info(`🔍 Obteniendo todos los IDs de productos para canal ${channelId}...`)

    let allIds: number[] = []

    // 1. Primera petición para saber cuántas páginas hay
    this.logger.info(`🔍 DEBUG - Primera petición a getProductsByChannel con limit=${limit}`)
    const firstResponse = await this.bigcommerceService.getProductsByChannel(channelId, 1, limit)
    this.logger.info(`🔍 DEBUG - Primera respuesta: ${firstResponse.data?.length || 0} productos`)

    if (!firstResponse.data || !Array.isArray(firstResponse.data)) {
      this.logger.warn(`⚠️ No se encontraron datos en la primera página para canal ${channelId}`)
      return []
    }

    const ids = firstResponse.data.map((item: any) => item.product_id || item.id)
    allIds.push(...ids)

    // 2. Calcular total de páginas
    const totalPages =
      firstResponse.meta && firstResponse.meta.pagination
        ? firstResponse.meta.pagination.total_pages
        : 1
    this.logger.info(`📄 Total de páginas a procesar: ${totalPages}`)

    if (totalPages === 1) {
      this.logger.info(`✅ Solo una página encontrada. Total productos: ${allIds.length}`)
      return allIds.filter(Boolean)
    }

    // 3. Lanzar el resto de páginas en paralelo (con límite de concurrencia)
    const limitConcurrency = pLimit(15)
    const pagePromises = []

    for (let page = 2; page <= totalPages; page++) {
      pagePromises.push(
        limitConcurrency(async () => {
          this.logger.debug(`📄 Procesando página ${page}/${totalPages}`)
          const response = await this.bigcommerceService.getProductsByChannel(
            channelId,
            page,
            limit
          )

          if (!response.data || !Array.isArray(response.data)) {
            this.logger.warn(`⚠️ No se encontraron datos en la página ${page}`)
            return []
          }

          return response.data.map((item: any) => item.product_id || item.id)
        })
      )
    }

    const results = await Promise.all(pagePromises)
    results.forEach((pageIds: number[]) => allIds.push(...pageIds))

    const finalIds = allIds.filter(Boolean)
    this.logger.info(`✅ Obtenidos ${finalIds.length} IDs de productos de ${totalPages} páginas`)

    return finalIds
  }

  /**
   * 💾 Guarda productos y variantes de forma eficiente usando updateOrCreateMany
   * @param productsWithVariants - Lista de productos con variantes formateadas
   */
  private async saveProductsAndVariants(
    productsWithVariants: FormattedProductWithModelVariants[]
  ): Promise<void> {
    this.logger.info(`💾 Iniciando guardado de ${productsWithVariants.length} productos...`)

    try {
      // ============================================================================
      // PASO 1: EXTRAER Y PREPARAR PRODUCTOS (SIN VARIANTES)
      // ============================================================================
      const productsToSave = productsWithVariants.map(({ variants, ...product }) => product)

      // ============================================================================
      // PASO 2: EXTRAER TODAS LAS VARIANTES DE TODOS LOS PRODUCTOS
      // ============================================================================
      const allVariants = productsWithVariants.flatMap((product) => product.variants)

      this.logger.info(`📦 Productos a guardar: ${productsToSave.length}`)
      this.logger.info(`🏷️ Variantes a guardar: ${allVariants.length}`)

      // ============================================================================
      // PASO 3: GUARDAR PRODUCTOS USANDO updateOrCreateMany
      // ============================================================================
      this.logger.info(`💾 Guardando productos...`)
      //console.log('productsToSave', productsToSave)
      await Product.updateOrCreateMany('product_id', productsToSave)
      this.logger.info(`✅ Productos guardados exitosamente`)

      // ============================================================================
      // PASO 4: GUARDAR VARIANTES USANDO updateOrCreateMany
      // ============================================================================
      this.logger.info(`💾 Guardando variantes...`)
      //console.log('allVariants', allVariants)
      await Variant.updateOrCreateMany('sku', allVariants)
      this.logger.info(`✅ Variantes guardadas exitosamente`)

      this.logger.info(
        `🎉 Sincronización completada: ${productsToSave.length} productos y ${allVariants.length} variantes`
      )
    } catch (error) {
      this.logger.error(`❌ Error al guardar productos y variantes:`, error)
      throw error
    }
  }

  /**
   * 🔧 Sincroniza opciones de productos por lotes
   * @param productsWithVariants - Lista de productos con variantes formateadas
   */
  private async syncOptions(
    productsWithVariants: FormattedProductWithModelVariants[]
  ): Promise<void> {
    this.logger.info(
      `🔧 Iniciando sincronización de opciones para ${productsWithVariants.length} productos...`
    )

    try {
      // 🚀 OPTIMIZACIÓN EXTREMA: Procesar todo en paralelo
      const BATCH_SIZE = 200 // Lotes más grandes para mejor rendimiento
      const batches = []

      // 📦 Crear lotes
      for (let i = 0; i < productsWithVariants.length; i += BATCH_SIZE) {
        batches.push(productsWithVariants.slice(i, i + BATCH_SIZE))
      }

      this.logger.info(`📦 Procesando ${batches.length} lotes de opciones en paralelo...`)

      // 🚀 Procesar todos los lotes en paralelo
      const batchResults = await Promise.all(
        batches.map(async (batch, batchIndex) => {
          try {
            // 🔧 Formatear opciones del lote
            const batchOptions = await this.formatOptionsService.formatOptions(batch)

            if (batchOptions.length === 0) {
              return { processed: 0, batch: batchIndex + 1 }
            }

            // 💾 Guardar lote inmediatamente
            await Option.updateOrCreateMany(['option_id', 'product_id'], batchOptions)

            this.logger.info(`✅ Lote ${batchIndex + 1}: ${batchOptions.length} opciones guardadas`)
            return { processed: batchOptions.length, batch: batchIndex + 1 }
          } catch (error) {
            this.logger.error(`❌ Error en lote ${batchIndex + 1}:`, error)
            return { processed: 0, batch: batchIndex + 1, error: error.message }
          }
        })
      )

      // 📊 Consolidar resultados
      const totalProcessed = batchResults.reduce((sum, result) => sum + result.processed, 0)
      const errors = batchResults.filter((result) => result.error)

      this.logger.info(
        `🎉 Sincronización de opciones completada: ${totalProcessed} registros guardados`
      )

      if (errors.length > 0) {
        this.logger.warn(`⚠️ ${errors.length} lotes tuvieron errores`)
      }
    } catch (error) {
      this.logger.error(`❌ Error al sincronizar opciones:`, error)
      throw error
    }
  }

  /**
   * 🔗 Sincroniza relaciones producto-categoría
   */
  private async syncProductCategories(
    products: FormattedProductWithModelVariants[]
  ): Promise<void> {
    this.logger.info(`🔗 Iniciando sincronización de relaciones producto-categoría...`)

    try {
      const result = await this.categoryService.syncCategoriesByProduct(products)

      if (result && result.success) {
        this.logger.info(`✅ Relaciones producto-categoría sincronizadas exitosamente`)
        this.logger.info(`📊 Resultado: ${result.message}`)

        // 📈 Mostrar estadísticas de procesamiento
        if (result.data?.processed) {
          this.logger.info(`📈 Relaciones procesadas: ${result.data.processed}`)
        }
      } else {
        this.logger.warn(
          `⚠️ Sincronización de relaciones producto-categoría completada con advertencias: ${result?.message || 'Sin mensaje'}`
        )
      }
    } catch (error) {
      this.logger.error(`❌ Error al sincronizar relaciones producto-categoría:`, error)
      throw error
    }
  }

  /**
   * 🔍 Sincroniza filtros de productos
   */
  private async syncFilters(): Promise<void> {
    this.logger.info(`🔍 Iniciando sincronización de filtros...`)

    try {
      const result = await this.filtersService.syncFiltersProducts()

      if (result.success) {
        this.logger.info(`✅ Filtros sincronizados exitosamente`)
        this.logger.info(`📊 Resultado: ${result.message}`)
        if (result.meta?.performance) {
          this.logger.info(
            `⚡ Rendimiento: ${result.meta.performance.relations_per_second} relaciones/segundo`
          )
        }
      } else {
        this.logger.warn(
          `⚠️ Sincronización de filtros completada con advertencias: ${result.message}`
        )
      }
    } catch (error) {
      this.logger.error(`❌ Error al sincronizar filtros:`, error)
      throw error
    }
  }

  /**
   * 📸 Captura el estado inicial del canal antes de la sincronización
   * @param channelId - ID del canal
   * @returns Estado inicial con todas las relaciones existentes
   */
  private async captureInitialState(channelId: number): Promise<{
    productIds: number[]
    categories: { product_id: number; category_id: number }[]
    options: { product_id: number; option_id: number }[]
    filters: { product_id: number; category_id: number }[]
  }> {
    try {
      this.logger.info(`📸 Capturando estado inicial del canal ${channelId}...`)

      // Obtener todas las relaciones existentes en paralelo
      const [channelProducts, categories, options, filters] = await Promise.all([
        this.getChannelProducts(channelId),
        this.getProductCategoriesByChannel(channelId),
        this.getProductOptionsByChannel(channelId),
        this.getProductFiltersByChannel(channelId),
      ])

      const productIds = channelProducts.map((cp) => cp.product_id)

      this.logger.info(`📸 Estado inicial capturado:`)
      this.logger.info(`  - Productos: ${productIds.length}`)
      this.logger.info(`  - Categorías: ${categories.length}`)
      this.logger.info(`  - Opciones: ${options.length}`)
      this.logger.info(`  - Filtros: ${filters.length}`)

      return {
        productIds,
        categories,
        options,
        filters,
      }
    } catch (error) {
      this.logger.error(`❌ Error capturando estado inicial:`, error)
      return {
        productIds: [],
        categories: [],
        options: [],
        filters: [],
      }
    }
  }

  /**
   * 🧹 Limpia relaciones huérfanas después de la sincronización
   * @param channelId - ID del canal sincronizado
   * @param initialState - Estado inicial capturado antes de la sincronización
   */
  private async cleanupOrphanedRelations(
    channelId: number,
    initialState: {
      productIds: number[]
      categories: { product_id: number; category_id: number }[]
      options: { product_id: number; option_id: number }[]
      filters: { product_id: number; category_id: number }[]
    }
  ): Promise<void> {
    try {
      this.logger.info(`🧹 Iniciando limpieza de relaciones huérfanas para canal ${channelId}...`)

      // 1. Obtener productos actuales del canal (después de la sincronización)
      const currentChannelProducts = await this.getChannelProducts(channelId)
      const currentProductIds = currentChannelProducts.map((cp) => cp.product_id)

      this.logger.info(`📊 Comparación de estados:`)
      this.logger.info(`  - Productos iniciales: ${initialState.productIds.length}`)
      this.logger.info(`  - Productos actuales: ${currentProductIds.length}`)

      // 2. Identificar productos que ya no están en el canal
      const removedProductIds = initialState.productIds.filter(
        (id) => !currentProductIds.includes(id)
      )

      this.logger.info(`🗑️ Productos removidos del canal: ${removedProductIds.length}`)

      // 3. Obtener relaciones actuales del canal
      const [currentCategories, currentOptions, currentFilters] = await Promise.all([
        this.getProductCategoriesByChannel(channelId),
        this.getProductOptionsByChannel(channelId),
        this.getProductFiltersByChannel(channelId),
      ])

      // 4. Identificar relaciones huérfanas por tipo
      const orphanedCategories = this.findOrphanedRelations(
        initialState.categories,
        currentCategories,
        'categorías'
      )
      const orphanedOptions = this.findOrphanedRelations(
        initialState.options,
        currentOptions,
        'opciones'
      )
      const orphanedFilters = this.findOrphanedRelations(
        initialState.filters,
        currentFilters,
        'filtros'
      )

      this.logger.info(`📊 Relaciones huérfanas identificadas:`)
      this.logger.info(`  - Categorías: ${orphanedCategories.length}`)
      this.logger.info(`  - Opciones: ${orphanedOptions.length}`)
      this.logger.info(`  - Filtros: ${orphanedFilters.length}`)

      // 5. Limpiar relaciones huérfanas en paralelo
      await Promise.all([
        this.cleanupSpecificOrphanedCategories(orphanedCategories),
        this.cleanupSpecificOrphanedOptions(orphanedOptions),
        this.cleanupSpecificOrphanedFilters(orphanedFilters),
        this.cleanupOrphanedChannelProducts(channelId, removedProductIds),
      ])

      this.logger.info(`✅ Limpieza de relaciones huérfanas completada`)
    } catch (error) {
      this.logger.error(`❌ Error en limpieza de relaciones huérfanas:`, error)
      // No lanzar error para no afectar la sincronización principal
    }
  }

  /**
   * 🔍 Identifica relaciones huérfanas comparando estado inicial vs actual
   * @param initialRelations - Relaciones que existían antes
   * @param currentRelations - Relaciones que existen ahora
   * @param relationType - Tipo de relación para logging
   * @returns Relaciones que estaban antes pero ya no están
   */
  private findOrphanedRelations<T extends { product_id: number }>(
    initialRelations: T[],
    currentRelations: T[],
    relationType: string
  ): T[] {
    // Crear un Set de relaciones actuales para búsqueda rápida
    const currentSet = new Set(
      currentRelations.map((rel) => `${rel.product_id}-${Object.values(rel).slice(1).join('-')}`)
    )

    // Encontrar relaciones que estaban antes pero ya no están
    const orphaned = initialRelations.filter((rel) => {
      const key = `${rel.product_id}-${Object.values(rel).slice(1).join('-')}`
      return !currentSet.has(key)
    })

    this.logger.info(`🔍 ${relationType}: ${orphaned.length} relaciones huérfanas identificadas`)

    return orphaned
  }

  /**
   * 🗑️ Limpia categorías específicas huérfanas
   */
  private async cleanupSpecificOrphanedCategories(
    orphanedCategories: { product_id: number; category_id: number }[]
  ): Promise<void> {
    if (orphanedCategories.length === 0) {
      this.logger.info(`ℹ️ No hay categorías huérfanas que limpiar`)
      return
    }

    try {
      this.logger.info(
        `🗑️ Limpiando ${orphanedCategories.length} categorías huérfanas específicas...`
      )

      // Procesar en lotes para evitar consultas muy grandes
      const BATCH_SIZE = 1000
      for (let i = 0; i < orphanedCategories.length; i += BATCH_SIZE) {
        const batch = orphanedCategories.slice(i, i + BATCH_SIZE)

        const result = await CategoryProduct.query()
          .whereIn(
            ['product_id', 'category_id'],
            batch.map((rel) => [rel.product_id, rel.category_id])
          )
          .delete()

        const deletedCount = Array.isArray(result) ? result.length : result
        this.logger.info(
          `✅ Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${deletedCount} categorías eliminadas`
        )
      }

      this.logger.info(`✅ Categorías huérfanas limpiadas exitosamente`)
    } catch (error) {
      this.logger.error(`❌ Error limpiando categorías huérfanas específicas:`, error)
    }
  }

  /**
   * 🗑️ Limpia opciones específicas huérfanas
   */
  private async cleanupSpecificOrphanedOptions(
    orphanedOptions: { product_id: number; option_id: number }[]
  ): Promise<void> {
    if (orphanedOptions.length === 0) {
      this.logger.info(`ℹ️ No hay opciones huérfanas que limpiar`)
      return
    }

    try {
      this.logger.info(`🗑️ Limpiando ${orphanedOptions.length} opciones huérfanas específicas...`)

      // Procesar en lotes para evitar consultas muy grandes
      const BATCH_SIZE = 1000
      for (let i = 0; i < orphanedOptions.length; i += BATCH_SIZE) {
        const batch = orphanedOptions.slice(i, i + BATCH_SIZE)

        const result = await Option.query()
          .whereIn(
            ['product_id', 'option_id'],
            batch.map((rel) => [rel.product_id, rel.option_id])
          )
          .delete()

        const deletedCount = Array.isArray(result) ? result.length : result
        this.logger.info(
          `✅ Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${deletedCount} opciones eliminadas`
        )
      }

      this.logger.info(`✅ Opciones huérfanas limpiadas exitosamente`)
    } catch (error) {
      this.logger.error(`❌ Error limpiando opciones huérfanas específicas:`, error)
    }
  }

  /**
   * 🗑️ Limpia filtros específicos huérfanas
   */
  private async cleanupSpecificOrphanedFilters(
    orphanedFilters: { product_id: number; category_id: number }[]
  ): Promise<void> {
    if (orphanedFilters.length === 0) {
      this.logger.info(`ℹ️ No hay filtros huérfanas que limpiar`)
      return
    }

    try {
      this.logger.info(`🗑️ Limpiando ${orphanedFilters.length} filtros huérfanas específicas...`)

      // Procesar en lotes para evitar consultas muy grandes
      const BATCH_SIZE = 1000
      for (let i = 0; i < orphanedFilters.length; i += BATCH_SIZE) {
        const batch = orphanedFilters.slice(i, i + BATCH_SIZE)

        const result = await FiltersProduct.query()
          .whereIn(
            ['product_id', 'category_id'],
            batch.map((rel) => [rel.product_id, rel.category_id])
          )
          .delete()

        const deletedCount = Array.isArray(result) ? result.length : result
        this.logger.info(
          `✅ Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${deletedCount} filtros eliminados`
        )
      }

      this.logger.info(`✅ Filtros huérfanas limpiados exitosamente`)
    } catch (error) {
      this.logger.error(`❌ Error limpiando filtros huérfanas específicas:`, error)
    }
  }

  /**
   * 🗑️ Limpia relaciones canal-producto huérfanas
   */
  private async cleanupOrphanedChannelProducts(
    channelId: number,
    currentProductIds: number[]
  ): Promise<void> {
    try {
      this.logger.info(`🗑️ Limpiando relaciones canal-producto huérfanas...`)

      const result = await ChannelProduct.query()
        .where('channel_id', channelId)
        .whereNotIn('product_id', currentProductIds)
        .delete()

      const deletedCount = Array.isArray(result) ? result.length : result
      if (deletedCount > 0) {
        this.logger.info(`✅ Eliminadas ${deletedCount} relaciones canal-producto huérfanas`)
      }
    } catch (error) {
      this.logger.error(`❌ Error limpiando relaciones canal-producto huérfanas:`, error)
    }
  }

  /**
   * 📊 Obtiene productos del canal desde la base de datos
   */
  private async getChannelProducts(channelId: number): Promise<{ product_id: number }[]> {
    try {
      return await ChannelProduct.query().where('channel_id', channelId).select('product_id')
    } catch (error) {
      this.logger.error(`❌ Error obteniendo productos del canal:`, error)
      return []
    }
  }

  /**
   * 📊 Obtiene categorías de productos por canal
   */
  private async getProductCategoriesByChannel(
    channelId: number
  ): Promise<{ product_id: number; category_id: number }[]> {
    try {
      return await CategoryProduct.query()
        .join('channel_product', 'category_products.product_id', '=', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
        .select('category_products.product_id', 'category_products.category_id')
    } catch (error) {
      this.logger.error(`❌ Error obteniendo categorías del canal:`, error)
      return []
    }
  }

  /**
   * 📊 Obtiene opciones de productos por canal
   */
  private async getProductOptionsByChannel(
    channelId: number
  ): Promise<{ product_id: number; option_id: number }[]> {
    try {
      return await Option.query()
        .join('channel_product', 'options.product_id', '=', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
        .select('options.product_id', 'options.option_id')
    } catch (error) {
      this.logger.error(`❌ Error obteniendo opciones del canal:`, error)
      return []
    }
  }

  /**
   * 📊 Obtiene filtros de productos por canal
   */
  private async getProductFiltersByChannel(
    channelId: number
  ): Promise<{ product_id: number; category_id: number }[]> {
    try {
      return await FiltersProduct.query()
        .join('channel_product', 'filters_products.product_id', '=', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
        .select('filters_products.product_id', 'filters_products.category_id')
    } catch (error) {
      this.logger.error(`❌ Error obteniendo filtros del canal:`, error)
      return []
    }
  }

  /**
   * 📊 Obtiene estadísticas completas del canal
   */
  private async getChannelStatistics(channelId: number): Promise<{
    products: number
    variants: number
    categories: number
    options: number
    filters: number
  }> {
    try {
      const [products, variants, categories, options, filters] = await Promise.all([
        this.getChannelProductsCount(channelId),
        this.getChannelVariantsCount(channelId),
        this.getChannelCategoriesCount(channelId),
        this.getChannelOptionsCount(channelId),
        this.getChannelFiltersCount(channelId),
      ])

      return {
        products,
        variants,
        categories,
        options,
        filters,
      }
    } catch (error) {
      this.logger.error(`❌ Error obteniendo estadísticas del canal:`, error)
      return {
        products: 0,
        variants: 0,
        categories: 0,
        options: 0,
        filters: 0,
      }
    }
  }

  /**
   * 📊 Obtiene cantidad de productos del canal
   */
  private async getChannelProductsCount(channelId: number): Promise<number> {
    try {
      this.logger.debug(`🔍 Contando productos para canal ${channelId}...`)
      const result = await ChannelProduct.query()
        .where('channel_id', channelId)
        .count('* as total')
        .first()
      const count = Number(result?.$extras.total || 0)
      this.logger.debug(`📊 Productos encontrados: ${count}`)
      return count
    } catch (error) {
      this.logger.error(`❌ Error contando productos del canal:`, error)
      return 0
    }
  }

  /**
   * 📊 Obtiene cantidad de variantes del canal
   */
  private async getChannelVariantsCount(channelId: number): Promise<number> {
    try {
      this.logger.debug(`🔍 Contando variantes para canal ${channelId}...`)
      const result = await Variant.query()
        .join('channel_product', 'variants.product_id', '=', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
        .count('* as total')
        .first()
      const count = Number(result?.$extras.total || 0)
      this.logger.debug(`📊 Variantes encontradas: ${count}`)
      return count
    } catch (error) {
      this.logger.error(`❌ Error contando variantes del canal:`, error)
      return 0
    }
  }

  /**
   * 📊 Obtiene cantidad de categorías del canal
   */
  private async getChannelCategoriesCount(channelId: number): Promise<number> {
    try {
      this.logger.debug(`🔍 Contando categorías para canal ${channelId}...`)
      const result = await CategoryProduct.query()
        .join('channel_product', 'category_products.product_id', '=', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
        .count('* as total')
        .first()
      const count = Number(result?.$extras.total || 0)
      this.logger.debug(`📊 Categorías encontradas: ${count}`)
      return count
    } catch (error) {
      this.logger.error(`❌ Error contando categorías del canal:`, error)
      return 0
    }
  }

  /**
   * 📊 Obtiene cantidad de opciones del canal
   */
  private async getChannelOptionsCount(channelId: number): Promise<number> {
    try {
      this.logger.debug(`🔍 Contando opciones para canal ${channelId}...`)
      const result = await Option.query()
        .join('channel_product', 'options.product_id', '=', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
        .count('* as total')
        .first()
      const count = Number(result?.$extras.total || 0)
      this.logger.debug(`📊 Opciones encontradas: ${count}`)
      return count
    } catch (error) {
      this.logger.error(`❌ Error contando opciones del canal:`, error)
      return 0
    }
  }

  /**
   * 📊 Obtiene cantidad de filtros del canal
   */
  private async getChannelFiltersCount(channelId: number): Promise<number> {
    try {
      this.logger.debug(`🔍 Contando filtros para canal ${channelId}...`)
      const result = await FiltersProduct.query()
        .join('channel_product', 'filters_products.product_id', '=', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
        .count('* as total')
        .first()
      const count = Number(result?.$extras.total || 0)
      this.logger.debug(`📊 Filtros encontrados: ${count}`)
      return count
    } catch (error) {
      this.logger.error(`❌ Error contando filtros del canal:`, error)
      return 0
    }
  }

  /**
   * 📊 Calcula los cambios entre estadísticas antes y después
   */
  private calculateChanges(
    before: {
      products: number
      variants: number
      categories: number
      options: number
      filters: number
    },
    after: {
      products: number
      variants: number
      categories: number
      options: number
      filters: number
    }
  ): {
    productsAdded: number
    productsRemoved: number
    variantsAdded: number
    variantsRemoved: number
    categoriesAdded: number
    categoriesRemoved: number
    optionsAdded: number
    optionsRemoved: number
    filtersAdded: number
    filtersRemoved: number
  } {
    return {
      productsAdded: Math.max(0, after.products - before.products),
      productsRemoved: Math.max(0, before.products - after.products),
      variantsAdded: Math.max(0, after.variants - before.variants),
      variantsRemoved: Math.max(0, before.variants - after.variants),
      categoriesAdded: Math.max(0, after.categories - before.categories),
      categoriesRemoved: Math.max(0, before.categories - after.categories),
      optionsAdded: Math.max(0, after.options - before.options),
      optionsRemoved: Math.max(0, before.options - after.options),
      filtersAdded: Math.max(0, after.filters - before.filters),
      filtersRemoved: Math.max(0, before.filters - after.filters),
    }
  }
}
