import type { BigcommerceProduct } from '#dto/bigcommerce/bigcommerce_product.dto'
import BigcommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import { ChannelConfigInterface } from '#interfaces/channel_interface'
import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'
import ChannelProduct from '#models/channel_product'
import Product from '#models/product'
import Variant from '#models/variant'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import pLimit from 'p-limit'
import CategoryService from '#services/categories_service'
import ChannelsService from '#services/channels_service'
import ChannelFormatProductsService from '#services/channel_format_products_service'
import FormatOptionsService from '#services/format_options_service'
import FormatVariantsService from '#services/format_variants_service'
import FiltersService from '#services/filters_service'
import InventoryService from '#services/inventory_service'
import ProductService from '#services/product_service'
import {
  partitionVariantsByBigCommerceId,
  releaseVariantSkuConflicts,
} from '#utils/release_variant_sku_conflicts'

export interface ChannelProductSyncServiceDeps {
  bigcommerceService: BigcommerceService
  productService: ProductService
  formatProductsService: ChannelFormatProductsService
  formatVariantsService: FormatVariantsService
  formatOptionsService: FormatOptionsService
  filtersService: FiltersService
  categoryService: CategoryService
  inventoryService: InventoryService
  channelsService: ChannelsService
}

export default class ChannelProductSyncService {
  private readonly logger = Logger.child({ service: 'ChannelProductSyncService' })
  private readonly bigcommerceService: BigcommerceService
  private readonly productService: ProductService
  private readonly currentChannelConfig: ChannelConfigInterface
  private readonly formatProductsService: ChannelFormatProductsService
  private readonly inventoryService: InventoryService
  private readonly formatVariantsService: FormatVariantsService
  private readonly formatOptionsService: FormatOptionsService
  private readonly filtersService: FiltersService
  private readonly categoryService: CategoryService
  private readonly channelsService: ChannelsService

  constructor(
    currentChannelConfig: ChannelConfigInterface,
    deps: ChannelProductSyncServiceDeps
  ) {
    this.currentChannelConfig = currentChannelConfig
    this.bigcommerceService = deps.bigcommerceService
    this.productService = deps.productService
    this.formatProductsService = deps.formatProductsService
    this.formatVariantsService = deps.formatVariantsService
    this.formatOptionsService = deps.formatOptionsService
    this.filtersService = deps.filtersService
    this.categoryService = deps.categoryService
    this.inventoryService = deps.inventoryService
    this.channelsService = deps.channelsService
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
                    const ids = variantBatch.map((v) => v.id)
                    const existingVariants = await Variant.query({ client: batchTrx })
                      .whereIn('id', ids)
                      .select('id', 'sku')

                    const existingIdsSet = new Set(existingVariants.map((v) => v.id))
                    const { toUpdate: variantsToUpdate, toCreate: variantsToCreate } =
                      partitionVariantsByBigCommerceId(variantBatch, existingIdsSet)

                    await releaseVariantSkuConflicts(variantsToUpdate, variantsToCreate, batchTrx)

                    if (variantsToUpdate.length > 0) {
                      await Variant.updateOrCreateMany('id', variantsToUpdate, { client: batchTrx })
                    }

                    // Crear variantes nuevas
                    if (variantsToCreate.length > 0) {
                      await Variant.createMany(variantsToCreate, { client: batchTrx })
                    }

                    this.logger.debug(
                      `Sub-lote de variantes ${variantBatchIndex + 1}/${variantBatches.length} procesado: ${variantsToUpdate.length} actualizadas, ${variantsToCreate.length} creadas`
                    )
                    return {
                      success: true,
                      processed: variantBatch.length,
                      batch: variantBatchIndex + 1,
                    }
                  } catch (variantError) {
                    this.logger.error(
                      {
                        error: variantError.message,
                        batch_size: variantBatch.length,
                        skus: variantBatch.map((v) => v.sku).slice(0, 5),
                      },
                      `Error en sub-lote de variantes ${variantBatchIndex + 1}`
                    )
                    throw variantError
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
              this.logger.error({ error: channelError }, 'Error al sincronizar canal')
            }

            // ========================================
            // SUB-PASO 3.6: SINCRONIZAR OPCIONES DEL LOTE
            // ========================================
            await this.formatOptionsService.syncOptionsForProducts(formattedVariants, batchTrx)

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
                {
                  ...errorDetails,
                  solution:
                    'La transacción fue abortada por un error anterior. Se ejecutará rollback automático.',
                },
                `Error de transacción PostgreSQL abortada en lote ${batchIndex + 1}`
              )
            } else if (error.message && error.message.includes('timeout')) {
              this.logger.error(
                {
                  ...errorDetails,
                  solution: 'Reducir tamaño de lote o aumentar timeout de base de datos',
                },
                `Timeout en lote ${batchIndex + 1}`
              )
            } else {
              this.logger.error(errorDetails, `Error en lote ${batchIndex + 1}`)
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
      this.logger.error({ error }, 'Error en sincronización de productos')
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

      const productIds = await this.productService.getAllProductIdsByChannel(channelId)
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
          this.logger.error({ error }, `Error en batch ${index + 1}`)
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
      this.logger.error({ error }, 'Error obteniendo productos de Bigcommerce')
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
      this.logger.error({ error }, 'Error al sincronizar relaciones producto-categoría')
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
      this.logger.error({ error }, 'Error al sincronizar filtros')
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
   * Limpieza de categorías huérfanas antes de guardar el lote nuevo; delega en CategoryService.
   */
  private async cleanupOrphanedCategoriesBeforeSave(
    productIds: number[],
    newRelationsToSave: { product_id: number; category_id: number }[],
    trx: TransactionClientContract
  ): Promise<number> {
    return this.categoryService.cleanupOrphanedCategoryProducts(
      productIds,
      newRelationsToSave,
      trx
    )
  }
}
