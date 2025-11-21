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
import ChannelProduct from '#models/channel_product'
import pLimit from 'p-limit'
import ChannelsService from './channels_service.js'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'

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
   * Sincronización Completa de Productos
   */
  async syncProductsComplete(): Promise<{
    success: boolean
    message: string
    data: {
      timestamp: string
      channelId: number
      channelName: string
      processed: {
        products: number
        variants: number
        batches: number
        totalTime: string
      }
    }
  }> {
    const startTime = Date.now() // Iniciar cronómetro
    const { CHANNEL, API_URL } = this.currentChannelConfig
    // Obtener el país configurado
    const configuredCountry = env.get('COUNTRY_CODE')
    this.logger.info(`País configurado en variables de entorno: ${configuredCountry}`)
    this.logger.info(`Iniciando sincronización completa para: ${API_URL}`)

    // ============================================================================
    // PASO 0: INICIO DE SINCRONIZACIÓN
    // ============================================================================
    this.logger.info(`Iniciando sincronización para canal ${CHANNEL}...`)

    // ============================================================================
    // PROCESAMIENTO SIN TRANSACCIÓN GLOBAL (CADA LOTE TIENE SU PROPIA TRANSACCIÓN)
    // ============================================================================
    try {
      this.logger.info(`Sincronizando`)
      // 1. Obtener actualizar o crear inventario
      const inventoryResult = await this.inventoryService.syncSafeStock()
      if (inventoryResult && 'status' in inventoryResult && inventoryResult.status === 'Error') {
        this.logger.error('Error en sincronización de stock de seguridad')
        throw new Error('Error al sincronizar el stock de seguridad')
      }
      if (env.get('COUNTRY_CODE') === 'PE') {
        const inventoryReserve = await this.inventoryService.saveInventoryReserve()
        if ('status' in inventoryReserve && inventoryReserve.status === 'Error') {
          console.log(' 😫 No se Guardó el Inventario de Reserva ')
          throw new Error('Error al sincronizar el stock inventario reserva Peru')
        }
      }
      if (env.get('COUNTRY_CODE') === 'CO') {
        const inventoryReserveColombia = await this.inventoryService.saveInventoryReserve()
        if ('status' in inventoryReserveColombia && inventoryReserveColombia.status === 'Error') {
          console.log(' 😫 No se Guardó el Inventario de Reserva de Colombia ')
          throw new Error('Error al sincronizar el stock inventario reserva Colombia')
        }
      }
      // 2. Obtener productos de Bigcommerce
      const bigcommerceProducts = await this.fetchBigcommerceProducts(CHANNEL)
      this.logger.info(`Obtenidos ${bigcommerceProducts.length} productos de Bigcommerce`)

      // ============================================================================
      // PASO 3: PROCESAR PRODUCTOS POR LOTES COMPLETOS (OPTIMIZADO)
      // ============================================================================
      const BATCH_SIZE = 200 // Tamaño de lote optimizado
      const allFormattedVariants: FormattedProductWithModelVariants[] = []

      // Crear lotes
      const batches = []
      for (let i = 0; i < bigcommerceProducts.length; i += BATCH_SIZE) {
        batches.push(bigcommerceProducts.slice(i, i + BATCH_SIZE))
      }

      this.logger.info(`Procesando ${batches.length} lotes completos de productos...`)

      // PROCESAMIENTO PROGRESIVO SIN LIMPIEZA INICIAL
      // La limpieza se hará al final para evitar datos vacíos durante la sincronización

      // Procesar cada lote completamente (secuencial para mejor control)
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]

        // Crear una nueva transacción para cada lote
        await db.transaction(async (batchTrx) => {
          try {
            this.logger.info(
              `Procesando lote ${batchIndex + 1}/${batches.length} (${batch.length} productos)`
            )

            // ========================================
            // SUB-PASO 3.1: FORMATEAR PRODUCTOS Y VARIANTES
            // ========================================
            const formattedProducts = await this.formatProductsService.formatProducts(
              batch,
              this.currentChannelConfig
            )

            const formattedVariants = await this.formatVariantsService.formatVariants(
              formattedProducts,
              this.currentChannelConfig
            )

            // ========================================
            // SUB-PASO 3.2: GUARDAR PRODUCTOS DEL LOTE
            // ========================================
            const productsToSave = formattedVariants.map(({ variants, ...product }) => product)
            await Product.updateOrCreateMany('id', productsToSave, { client: batchTrx })

            // ========================================
            // SUB-PASO 3.3: SINCRONIZAR CATEGORÍAS DEL LOTE (PARA KEYWORDS)
            // ========================================
            await this.syncProductCategories(formattedVariants, batchTrx)

            // ========================================
            // SUB-PASO 3.4: GUARDAR VARIANTES CON KEYWORDS GENERADAS (EN LOTES MÁS PEQUEÑOS)
            // ========================================
            const allVariants = formattedVariants.flatMap((product) => product.variants)

            // Dividir variantes en lotes más pequeños para evitar timeouts
            const VARIANT_BATCH_SIZE = 100
            const variantBatches = []
            for (let i = 0; i < allVariants.length; i += VARIANT_BATCH_SIZE) {
              variantBatches.push(allVariants.slice(i, i + VARIANT_BATCH_SIZE))
            }

            this.logger.info(
              `Procesando ${variantBatches.length} sub-lotes de variantes en paralelo...`
            )

            // Procesar sub-lotes de variantes en paralelo con límite de concurrencia
            const limitConcurrency = pLimit(3) // Máximo 3 sub-lotes en paralelo
            const variantBatchResults = await Promise.all(
              variantBatches.map((variantBatch, variantBatchIndex) =>
                limitConcurrency(async () => {
                  try {
                    await Variant.updateOrCreateMany('sku', variantBatch, { client: batchTrx })
                    this.logger.debug(
                      `Sub-lote de variantes ${variantBatchIndex + 1}/${variantBatches.length} procesado`
                    )
                    return {
                      success: true,
                      processed: variantBatch.length,
                      batch: variantBatchIndex + 1,
                    }
                  } catch (variantError) {
                    this.logger.error(`Error en sub-lote de variantes ${variantBatchIndex + 1}:`, {
                      error: variantError.message,
                      batch_size: variantBatch.length,
                      skus: variantBatch.map((v) => v.sku).slice(0, 5), // Solo primeros 5 SKUs para log
                    })
                    throw variantError // Re-lanzar para que la transacción haga rollback
                  }
                })
              )
            )

            // Consolidar resultados de sub-lotes
            const totalVariantsProcessed = variantBatchResults.reduce(
              (sum, result) => sum + result.processed,
              0
            )
            this.logger.info(
              `Variantes procesadas: ${totalVariantsProcessed} en ${variantBatches.length} sub-lotes`
            )

            // ========================================
            // SUB-PASO 3.5: GUARDAR RELACIÓN CANAL-PRODUCTO DEL LOTE (EN TRANSACCIÓN SEPARADA)
            // ========================================
            try {
              await db.transaction(async (channelTrx) => {
                await this.channelsService.syncChannelByProduct(
                  formattedVariants,
                  this.currentChannelConfig.CHANNEL,
                  channelTrx
                )
              })
            } catch (channelError) {
              this.logger.error(`Error al sincronizar canal:`, channelError)
            }

            // ========================================
            // SUB-PASO 3.6: SINCRONIZAR OPCIONES DEL LOTE
            // ========================================
            await this.syncOptions(formattedVariants, batchTrx)

            // ========================================
            // SUB-PASO 3.7: COMMIT AUTOMÁTICO DEL LOTE
            // ========================================
            this.logger.info(`Commit automático del lote ${batchIndex + 1}...`)
            // El commit se hace automáticamente al salir del bloque transaction

            // Acumular para estadísticas finales
            allFormattedVariants.push(...formattedVariants)

            this.logger.info(
              `Lote ${batchIndex + 1} completado: ${formattedVariants.length} productos procesados completamente`
            )
          } catch (error) {
            // Manejo robusto de errores con rollback automático
            const errorDetails = {
              error: error.message,
              stack: error.stack,
              batch_size: batch.length,
              batch_index: batchIndex + 1,
              error_type: error.constructor.name,
            }

            // Detectar errores específicos de PostgreSQL
            if (error.message && error.message.includes('current transaction is aborted')) {
              this.logger.error(
                `Error de transacción PostgreSQL abortada en lote ${batchIndex + 1}:`,
                {
                  ...errorDetails,
                  solution:
                    'La transacción fue abortada por un error anterior. Se ejecutará rollback automático.',
                }
              )
            } else if (error.message && error.message.includes('timeout')) {
              this.logger.error(`Timeout en lote ${batchIndex + 1}:`, {
                ...errorDetails,
                solution: 'Reducir tamaño de lote o aumentar timeout de base de datos',
              })
            } else {
              this.logger.error(`Error en lote ${batchIndex + 1}:`, errorDetails)
            }

            // El rollback se ejecuta automáticamente al salir del catch
            // debido a que la transacción no se commitea
            throw error
          }
        })
      }

      this.logger.info(`Total productos procesados: ${allFormattedVariants.length}`)

      // ============================================================================
      // PASO 3.5: LIMPIEZA FINAL - ELIMINAR PRODUCTOS OBSOLETOS DEL CANAL
      // ============================================================================
      this.logger.info(
        `🧹 Iniciando limpieza final del canal ${this.currentChannelConfig.CHANNEL}...`
      )

      const allProductIds = bigcommerceProducts.map((p) => p.id)
      await db.transaction(async (cleanupTrx) => {
        this.logger.info(`Eliminando productos obsoletos del canal...`)

        const deletedCount = await ChannelProduct.query({ client: cleanupTrx })
          .where('channel_id', this.currentChannelConfig.CHANNEL)
          .whereNotIn('product_id', allProductIds)
          .delete()

        this.logger.info(
          `Limpieza final completada: ${deletedCount} productos obsoletos eliminados`
        )
      })

      // ============================================================================
      // PASO 4: SINCRONIZAR FILTROS DE PRODUCTOS (CON TRANSACCIÓN)
      // ============================================================================
      this.logger.info(`Sincronizando filtros de productos...`)
      await db.transaction(async (filtersTrx) => {
        await this.syncFilters(filtersTrx)
      })
      this.logger.info(`Filtros sincronizados correctamente`)

      // ============================================================================
      // PASO 5: LOGS FINALES
      // ============================================================================
      this.logger.info(`Sincronización completada`)

      // ============================================================================
      // PASO 6: PREPARAR RESPUESTA FINAL (ULTRA OPTIMIZADO)
      // ============================================================================

      // Preparar respuesta simplificada con totales procesados
      const totalTime = Date.now() - startTime
      const finalResponse = {
        success: true,
        message: `Sincronización completada para canal ${CHANNEL}`,
        data: {
          timestamp: new Date().toISOString(),
          channelId: CHANNEL,
          channelName: String(this.currentChannelConfig.CHANNEL || 'Unknown'),
          processed: {
            products: allFormattedVariants.length,
            variants: allFormattedVariants.reduce(
              (total, product) => total + product.variants.length,
              0
            ),
            batches: batches.length,
            totalTime: `${totalTime}ms`,
          },
        },
      }

      // Log final con tiempo total
      this.logger.info(`Sincronización completada en ${totalTime}ms - Enviando respuesta...`)

      return finalResponse
    } catch (error) {
      this.logger.error(`Error en sincronización de productos:`, error)
      throw error
    }
  }

  /**
   * Obtener productos de Bigcommerce con estrategia de batching
   */
  private async fetchBigcommerceProducts(channelId: number): Promise<BigcommerceProduct[]> {
    this.logger.info(`Obteniendo productos de Bigcommerce para canal ${channelId}...`)

    try {
      // ============================================================================
      // PASO 1: OBTENER TODOS LOS PRODUCTOS POR CANAL (CON PAGINACIÓN)
      // ============================================================================
      this.logger.info(`Obteniendo todos los productos por canal con paginación...`)

      const productIds = await this.getAllProductIdsByChannel(channelId)
      const totalProducts = productIds.length

      this.logger.info(`Total de productos en API: ${totalProducts}`)

      if (totalProducts === 0) {
        this.logger.warn(`No hay productos asignados al canal ${channelId}`)
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

      this.logger.info(`Dividido en ${batches.length} batches de máximo ${batchSize} productos`)
      this.logger.info(`Usando PARENT_CATEGORY: ${this.currentChannelConfig.PARENT_CATEGORY}`)

      // ============================================================================
      // PASO 3: CONSULTAR INFORMACIÓN DETALLADA EN PARALELO
      // ============================================================================
      this.logger.info(`Procesando ${batches.length} batches en paralelo...`)

      const batchPromises = batches.map(async (batchIds, index) => {
        try {
          this.logger.info(
            `Procesando batch ${index + 1}/${batches.length} con ${batchIds.length} productos`
          )

          const productsPerPage = await this.bigcommerceService.getAllProductsRefactoring(
            batchIds,
            0, // visible = 0 (todos los productos)
            this.currentChannelConfig.PARENT_CATEGORY // parentCategory del canal
          )

          this.logger.info(
            `Batch ${index + 1} completado: ${productsPerPage.data?.length || 0} productos`
          )
          return productsPerPage.data || []
        } catch (error) {
          this.logger.error(`Error en batch ${index + 1}:`, error)
          return []
        }
      })

      // Esperar a que todas las promesas se resuelvan
      const batchResults = await Promise.all(batchPromises)

      // ============================================================================
      // PASO 4: CONCATENAR RESULTADOS Y LIMPIAR
      // ============================================================================
      // Concatenar los resultados de los lotes en un solo array
      const allProducts = batchResults.flat()
      // Eliminar duplicados por ID
      const uniqueProducts = allProducts.filter(
        (product, index, self) => index === self.findIndex((p) => p.id === product.id)
      )

      this.logger.info(`Productos únicos obtenidos: ${uniqueProducts.length}`)
      this.logger.info(
        `Productos duplicados eliminados: ${allProducts.length - uniqueProducts.length}`
      )

      // Verificación final
      const finalCount = uniqueProducts.length
      const expectedTotal = productIds.length
      const percentage = ((finalCount / expectedTotal) * 100).toFixed(1)

      this.logger.info(
        `Verificación final: ${finalCount} de ${expectedTotal} productos procesados (${percentage}%)`
      )

      if (finalCount < expectedTotal) {
        const missingCount = expectedTotal - finalCount
        this.logger.warn(`${missingCount} productos no pudieron ser obtenidos`)
      }

      return uniqueProducts
    } catch (error) {
      this.logger.error(`Error obteniendo productos de Bigcommerce:`, error)
      throw error
    }
  }

  /**
   * Obtiene todos los IDs de productos asignados a un canal, recorriendo todas las páginas
   */
  private async getAllProductIdsByChannel(channelId: number, limit = 200): Promise<number[]> {
    this.logger.info(`Obteniendo todos los IDs de productos para canal ${channelId}...`)

    let allIds: number[] = []

    // 1. Primera petición para saber cuántas páginas hay
    const firstResponse = await this.bigcommerceService.getProductsByChannel(channelId, 1, limit)

    if (!firstResponse.data || !Array.isArray(firstResponse.data)) {
      this.logger.warn(`No se encontraron datos en la primera página para canal ${channelId}`)
      return []
    }

    const ids = firstResponse.data.map((item: any) => item.product_id || item.id)
    allIds.push(...ids)

    // 2. Calcular total de páginas
    const totalPages =
      firstResponse.meta && firstResponse.meta.pagination
        ? firstResponse.meta.pagination.total_pages
        : 1
    this.logger.info(`Total de páginas a procesar: ${totalPages}`)

    if (totalPages === 1) {
      this.logger.info(`Solo una página encontrada. Total productos: ${allIds.length}`)
      return allIds.filter(Boolean)
    }

    // 3. Lanzar el resto de páginas en paralelo (con límite de concurrencia optimizado)
    const limitConcurrency = pLimit(25) // Aumentado para máximo rendimiento
    const pagePromises = []

    for (let page = 2; page <= totalPages; page++) {
      pagePromises.push(
        limitConcurrency(async () => {
          const response = await this.bigcommerceService.getProductsByChannel(
            channelId,
            page,
            limit
          )

          if (!response.data || !Array.isArray(response.data)) {
            this.logger.warn(`No se encontraron datos en la página ${page}`)
            return []
          }

          return response.data.map((item: any) => item.product_id || item.id)
        })
      )
    }

    const results = await Promise.all(pagePromises)
    results.forEach((pageIds: number[]) => allIds.push(...pageIds))

    const finalIds = allIds.filter(Boolean)
    this.logger.info(`Obtenidos ${finalIds.length} IDs de productos de ${totalPages} páginas`)

    return finalIds
  }

  /**
   * Sincroniza opciones de productos por lotes
   * @param productsWithVariants - Lista de productos con variantes formateadas
   * @param trx - Transacción de base de datos (opcional)
   */
  private async syncOptions(
    productsWithVariants: FormattedProductWithModelVariants[],
    trx?: QueryClientContract
  ): Promise<void> {
    this.logger.info(
      `Iniciando sincronización de opciones para ${productsWithVariants.length} productos...`
    )

    try {
      // OPTIMIZACIÓN EXTREMA: Procesar todo en paralelo
      const BATCH_SIZE = 500 // Lotes más grandes para mejor rendimiento
      const batches = []

      // Crear lotes
      for (let i = 0; i < productsWithVariants.length; i += BATCH_SIZE) {
        batches.push(productsWithVariants.slice(i, i + BATCH_SIZE))
      }

      this.logger.info(`Procesando ${batches.length} lotes de opciones en paralelo...`)

      // Procesar todos los lotes en paralelo con pLimit para control de concurrencia
      const limit = pLimit(12) // Aumentado para mejor rendimiento
      const batchResults = await Promise.all(
        batches.map((batch, batchIndex) =>
          limit(async () => {
            try {
              // Formatear opciones del lote
              const batchOptions = await this.formatOptionsService.formatOptions(batch)

              if (batchOptions.length === 0) {
                return { processed: 0, batch: batchIndex + 1 }
              }

              // 💾 Guardar lote inmediatamente con transacción
              await Option.updateOrCreateMany(
                ['option_id', 'product_id'],
                batchOptions,
                trx ? { client: trx } : undefined
              )

              this.logger.info(`Lote ${batchIndex + 1}: ${batchOptions.length} opciones guardadas`)
              return { processed: batchOptions.length, batch: batchIndex + 1 }
            } catch (error) {
              this.logger.error(`Error en lote ${batchIndex + 1}:`, error)
              console.log(error)
              return { processed: 0, batch: batchIndex + 1, error: error.message }
            }
          })
        )
      )

      // Consolidar resultados
      const totalProcessed = batchResults.reduce((sum, result) => sum + result.processed, 0)
      const errors = batchResults.filter((result) => result.error)

      this.logger.info(
        `Sincronización de opciones completada: ${totalProcessed} registros guardados`
      )

      if (errors.length > 0) {
        this.logger.warn(`${errors.length} lotes tuvieron errores`)
      }
    } catch (error) {
      this.logger.error(`Error al sincronizar opciones:`, error)
      throw error
    }
  }

  /**
   * Sincroniza relaciones producto-categoría
   * @param products - Lista de productos con variantes formateadas
   * @param trx - Transacción de base de datos (obligatorio)
   */
  private async syncProductCategories(
    products: FormattedProductWithModelVariants[],
    trx: TransactionClientContract
  ): Promise<void> {
    this.logger.info(`Iniciando sincronización de relaciones producto-categoría...`)

    try {
      // Generar el lote de relaciones que se van a guardar desde los datos formateados
      const productIds = products.map((p) => p.product_id)
      const newRelationsToSave: { product_id: number; category_id: number }[] = []

      for (const product of products) {
        if (product.categories && Array.isArray(product.categories)) {
          for (const categoryId of product.categories) {
            newRelationsToSave.push({
              product_id: product.product_id,
              category_id: categoryId,
            })
          }
        }
      }

      this.logger.info(
        `Lote de relaciones a guardar: ${newRelationsToSave.length} para ${productIds.length} productos`
      )

      // Limpiar relaciones existentes que NO están en el lote nuevo
      await this.cleanupOrphanedCategoriesBeforeSave(productIds, newRelationsToSave, trx)

      // Sincronizar nuevas relaciones
      const result = await this.categoryService.syncCategoriesByProduct(products, trx)

      if (result && result.success) {
        this.logger.info(`Relaciones producto-categoría sincronizadas`)
        this.logger.info(`Resultado: ${result.message}`)

        // Mostrar estadísticas de procesamiento
        if (result.data?.processed) {
          this.logger.info(`Relaciones procesadas: ${result.data.processed}`)
        }
      } else {
        this.logger.warn(
          `Sincronización de relaciones producto-categoría completada con advertencias: ${result?.message || 'Sin mensaje'}`
        )
      }
    } catch (error) {
      this.logger.error(`Error al sincronizar relaciones producto-categoría:`, error)
      throw error
    }
  }

  /**
   * Sincroniza filtros de productos
   * @param trx - Transacción de base de datos (opcional)
   */
  private async syncFilters(trx?: QueryClientContract): Promise<void> {
    this.logger.info(`Iniciando sincronización de filtros...`)

    try {
      const result = await this.filtersService.syncFiltersProducts(trx)

      if (result.success) {
        this.logger.info(`Filtros sincronizados correctamente`)
        this.logger.info(`Resultado: ${result.message}`)
        if (result.meta?.performance) {
          this.logger.info(
            `Rendimiento: ${result.meta.performance.relations_per_second} relaciones/segundo`
          )
        }
      } else {
        this.logger.warn(`Sincronización de filtros completada con advertencias: ${result.message}`)
      }
    } catch (error) {
      this.logger.error(`Error al sincronizar filtros:`, error)
      throw error
    }
  }

  // ============================================================================
  // MÉTODOS DE LIMPIEZA RÁPIDA (OPTIMIZADOS)
  // ============================================================================

  // ============================================================================
  // MÉTODOS DE LIMPIEZA ANTES DE GUARDAR
  // ============================================================================

  /**
   * Limpieza de categorías huérfanas ANTES de guardar el lote nuevo
   * Elimina las relaciones existentes que NO están en el lote que se va a guardar
   * @param productIds - IDs de productos que se van a sincronizar
   * @param newRelationsToSave - Lote de relaciones que se van a guardar
   * @param trx - Transacción de base de datos (opcional)
   * @returns Número de categorías eliminadas
   */
  private async cleanupOrphanedCategoriesBeforeSave(
    productIds: number[],
    newRelationsToSave: { product_id: number; category_id: number }[],
    trx: TransactionClientContract
  ): Promise<number> {
    try {
      this.logger.info(`Limpieza de categorías huérfanas antes de guardar...`)

      if (newRelationsToSave.length === 0) {
        this.logger.info(`No hay relaciones nuevas para guardar, eliminando todas las existentes`)
        // Si no hay relaciones nuevas, eliminar todas las existentes para estos productos
        const deleted = await CategoryProduct.query({ client: trx })
          .whereIn('product_id', productIds)
          .delete()
        const totalDeleted = Array.isArray(deleted) ? deleted.length : deleted
        this.logger.info(`Categorías eliminadas: ${totalDeleted}`)
        return totalDeleted
      }

      // Crear un Set de las relaciones que se van a guardar para búsqueda rápida
      const newRelationsSet = new Set(
        newRelationsToSave.map((rel) => `${rel.product_id}-${rel.category_id}`)
      )

      this.logger.info(`Relaciones que se van a guardar: ${newRelationsToSave.length}`)

      // Obtener todas las relaciones existentes para estos productos
      const existingRelations = await CategoryProduct.query({ client: trx })
        .whereIn('product_id', productIds)
        .select('product_id', 'category_id')

      this.logger.info(`Relaciones existentes en BD: ${existingRelations.length}`)

      // Identificar relaciones que existen en BD pero NO están en el lote nuevo
      const orphanedRelations = existingRelations.filter((rel) => {
        const key = `${rel.product_id}-${rel.category_id}`
        return !newRelationsSet.has(key)
      })

      if (orphanedRelations.length === 0) {
        this.logger.info(`No hay categorías huérfanas para eliminar`)
        return 0
      }

      this.logger.info(`🗑️ Categorías huérfanas detectadas: ${orphanedRelations.length}`)

      // Eliminar relaciones huérfanas con pLimit para máximo rendimiento
      const limit = pLimit(20) // Aumentado para mejor rendimiento
      const batchSize = 1000 // Lotes más grandes
      const batches: { product_id: number; category_id: number }[][] = []

      for (let i = 0; i < orphanedRelations.length; i += batchSize) {
        batches.push(orphanedRelations.slice(i, i + batchSize))
      }

      this.logger.info(`Procesando ${batches.length} lotes de categorías huérfanas...`)

      const batchPromises = batches.map((batch) =>
        limit(async () => {
          let deleted = 0
          for (const relation of batch) {
            try {
              const result = await CategoryProduct.query({ client: trx })
                .where('product_id', relation.product_id)
                .where('category_id', relation.category_id)
                .delete()
              deleted += Array.isArray(result) ? result.length : result
            } catch (error) {
              this.logger.error(
                `Error eliminando categoría huérfana ${relation.product_id}-${relation.category_id}:`,
                error
              )
            }
          }
          return deleted
        })
      )

      const results = await Promise.all(batchPromises)
      const totalDeleted = results.reduce((sum, count) => sum + count, 0)

      this.logger.info(`Categorías huérfanas eliminadas: ${totalDeleted}`)
      return totalDeleted
    } catch (error) {
      this.logger.error('Error en limpieza de categorías antes de guardar:', error)
      return 0
    }
  }
}
