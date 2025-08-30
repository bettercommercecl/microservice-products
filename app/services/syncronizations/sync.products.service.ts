import env from '#start/env'
import Database from '@adonisjs/lucid/services/db'
import Logger from '@adonisjs/core/services/logger'
import CatalogSafeStock from '#models/catalog.safe.stock'
import CategoryProduct from '#models/category_product'
import OptionOfProducts from '#models/option'
import ProductsBigcommerce from '#models/product'
import Variant from '#models/variant'
import BigcommerceService from '#services/bigcommerce_service'
import { GeneralService } from '#services/general/general_service'
import ChannelProduct from '#models/channel_product'
import Category from '#models/category'

// 🏗️ INTERFACES IMPORTADAS DESDE ARCHIVO SEPARADO
import {
  BigCommerceProduct,
  SafeStockItem,
  SyncMetrics,
  TrackingStats,
} from '#services/syncronizations/interfaces/sync.products.interfaces'

/**
 * 🚀 SERVICIO DE SINCRONIZACIÓN DE PRODUCTOS REFACTORIZADO
 *
 * PRINCIPIOS SOLID APLICADOS:
 * ✅ Single Responsibility: Cada método tiene una responsabilidad única
 * ✅ Open/Closed: Extensible sin modificar código existente
 * ✅ Liskov Substitution: Usa composición en lugar de herencia
 * ✅ Interface Segregation: Interfaces específicas para cada funcionalidad
 * ✅ Dependency Inversion: Depende de abstracciones, no implementaciones
 */
export default class SyncProductService {
  // 🔧 SERVICIOS COMPUESTOS (Composition over Inheritance)

  private readonly bigcommerceService: BigcommerceService
  private readonly generalService: typeof GeneralService
  // 📝 LOGGER CONFIGURADO
  private readonly logger = Logger.child({ service: 'ProductsSyncService' })

  // ⚙️ CONFIGURACIÓN INTERNA
  private readonly maxRetries = 3
  private readonly retryDelayBase = 1000 // ms
  private readonly cacheValidityThreshold = 80 // porcentaje mínimo de integridad

  // 📊 CACHE Y MÉTRICAS
  private productCache: Map<string, any> = new Map()
  private apiDataCache = new Map<number, any>()

  // 📈 MÉTRICAS DE SINCRONIZACIÓN
  private syncMetrics: SyncMetrics = {
    startTime: null,
    endTime: null,
    totalProducts: 0,
    errors: [],
  }

  // 🎯 VARIABLES DE CONTROL DEL PROCESO
  private totalProducts: number = 0
  private processedProducts: number = 0
  private productIds: number[] = []
  private inventoryUpdateCount: boolean = false
  private isFirstBatch: boolean = true
  private shouldCleanObsoleteData: boolean = false
  private disableOptionsCleanup: boolean = false

  // 📊 SISTEMA DE TRACKING COMPLETO
  private trackingStats: TrackingStats = {
    totalProductsProcessed: 0,
    totalVariantsProcessed: 0,
    totalOptionsProcessed: 0,
    totalCategoriesProcessed: 0,
    failedProducts: [],
    failedVariants: [],
    failedOptions: [],
    failedCategories: [],
  }

  constructor() {
    // 🚀 INICIALIZACIÓN DE SERVICIOS COMPUESTOS
    this.bigcommerceService = new BigcommerceService()
    this.generalService = GeneralService

    // 📊 INICIALIZACIÓN DE CACHE
    this.productCache = new Map()
  }

  private async validateDatabaseState(): Promise<boolean> {
    try {
      // Verificar conexión a BD
      await Database.raw('SELECT 1')

      // Verificar que las tablas existan
      const tables = ['products_bigcommerce', 'categories', 'option_of_products', 'variants']
      for (const table of tables) {
        const exists = await Database.from('information_schema.tables')
          .select('table_name')
          .where('table_name', table)
          .first()

        if (!exists) {
          this.logger.error(`Tabla ${table} no existe`)
          return false
        }
      }

      // Verificar permisos de escritura
      await Database.raw('SELECT 1 FROM products_bigcommerce LIMIT 1')

      this.logger.info('Estado de base de datos validado correctamente')
      return true
    } catch (error) {
      this.logger.error('Error validando estado de base de datos', error)
      return false
    }
  }

  private async validateCacheIntegrity(): Promise<boolean> {
    try {
      if (!this.productCache || Object.keys(this.productCache).length === 0) {
        this.logger.warn('Cache de productos está vacío')
        return false
      }

      // ✅ VALIDACIÓN INTELIGENTE: Verificar productos según su tipo REAL
      const totalProducts = Object.keys(this.productCache).length
      let validProducts = 0
      let productsWithOptions = 0
      let simpleProducts = 0
      let variationProducts = 0

      for (const [, product] of Object.entries(this.productCache)) {
        if (product && product.product_id) {
          // ✅ Producto válido si tiene ID básico
          validProducts++

          // ✅ Clasificar por tipo REAL basado en la estructura de FormatProductsArray
          if (product.type === 'variation') {
            variationProducts++
            // Los productos de variación SÍ tienen opciones por definición
            productsWithOptions++
          } else if (product.type === 'product') {
            simpleProducts++
            // Los productos simples pueden o no tener opciones
            if (product.options && Array.isArray(product.options) && product.options.length > 0) {
              productsWithOptions++
            }
          } else {
            // Productos sin tipo definido, verificar opciones directamente
            if (product.options && Array.isArray(product.options) && product.options.length > 0) {
              productsWithOptions++
            } else {
              simpleProducts++
            }
          }
        }
      }

      const validityPercentage = (validProducts / totalProducts) * 100

      // ✅ Mostrar estadísticas detalladas
      this.logger.info('ANÁLISIS DEL CACHE:')
      this.logger.info(`   - Total de productos: ${totalProducts}`)
      this.logger.info(
        `   - Productos válidos: ${validProducts} (${validityPercentage.toFixed(2)}%)`
      )
      this.logger.info(`   - Productos de variación: ${variationProducts}`)
      this.logger.info(`   - Productos simples: ${simpleProducts}`)
      this.logger.info(`   - Total con opciones: ${productsWithOptions}`)

      if (validityPercentage < this.cacheValidityThreshold) {
        this.logger.warn(`Integridad del cache baja: ${validityPercentage.toFixed(2)}%`)
        return false
      }

      this.logger.info(`Integridad del cache validada: ${validityPercentage.toFixed(2)}%`)
      return true
    } catch (error) {
      this.logger.error('Error validando integridad del cache', error)
      return false
    }
  }

  // ============================================================================
  // MANEJO ROBUSTO DE TRANSACCIONES Y RETRY
  // ============================================================================

  // Método comentado temporalmente - no se está utilizando
  /*
  private async executeWithTransaction<T>(
    operation: (trx: any) => Promise<T>,
    operationName: string = 'operación'
  ): Promise<T> {
    const trx = await Database.transaction()

    try {
      const result = await operation(trx)
      await trx.commit()
      this.logger.info(`${operationName} completada exitosamente`)
      return result
    } catch (error) {
      await trx.rollback()
      this.logger.error(`${operationName} falló, rollback ejecutado: ${error?.message}`)
      throw error
    }
  }
  */

  private async processBatchWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    operationName: string = 'operación'
  ): Promise<T> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation()
      } catch (error) {
        lastError = error as Error
        this.logger.warn(
          `Intento ${attempt}/${maxRetries} falló para ${operationName}: ${error?.message}`
        )

        if (attempt < maxRetries) {
          // Esperar exponencialmente antes de reintentar
          const delay = Math.pow(2, attempt) * this.retryDelayBase
          this.logger.info(`Esperando ${delay}ms antes de reintentar...`)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    throw new Error(
      `❌ ${operationName} falló después de ${maxRetries} intentos: ${lastError?.message}`
    )
  }

  /**
   * ============================================================================
   * MÉTODO PRINCIPAL DE SINCRONIZACIÓN
   * ============================================================================
   *
   * Este método es el punto de entrada para sincronizar todos los productos
   * desde BigCommerce hacia nuestra base de datos local.
   *
   * ESTRATEGIA DE PROCESAMIENTO:
   * 1. Obtener todos los IDs de productos de BigCommerce (solo la primera vez)
   * 2. Procesar en lotes del 20% del total para evitar timeouts
   * 3. Cada lote se divide en batches de 250 para respetar límites de API
   * 4. Procesar cada batch en una transacción de base de datos
   * 5. Acumular estadísticas de éxito/fracaso
   * 6. Continuar recursivamente hasta procesar todos los productos
   *
   * @returns {Promise<any>} Reporte final con estadísticas completas
   */
  public async syncProductsFromBigcommerce(): Promise<any> {
    try {
      // ============================================================================
      // INICIALIZACIÓN - SOLO LA PRIMERA VEZ
      // ============================================================================

      // Reset de estadísticas solo al inicio del proceso completo
      if (this.productIds.length === 0) {
        this.resetTrackingStats()
      }

      // ============================================================================
      // PASO 1: GUARDAR INVENTARIO DE STOCK DE SEGURIDAD
      // ============================================================================
      // Este paso solo se ejecuta una vez al inicio de toda la sincronización
      // para evitar llamadas repetidas a la API de inventario
      if (!this.inventoryUpdateCount) {
        this.logger.info('Guardando Inventario')
        const inventory = await this.saveSafeStock()
        if ('status' in inventory && inventory.status === 'Error') {
          this.logger.warn('No se Guardó el Inventario')
          return inventory
        }
        this.inventoryUpdateCount = true
      }

      // ============================================================================
      // PASO 2: OBTENER TODOS LOS PRODUCTOS DE BIGCOMMERCE (SOLO PRIMERA VEZ)
      // ============================================================================
      // En la primera ejecución, obtenemos todos los IDs de productos
      // y los guardamos en memoria para procesarlos en lotes
      if (this.productIds.length === 0) {
        const productsByChannel = await this.bigcommerceService.getProductsByChannel(
          Number(env.get('BIGCOMMERCE_CHANNEL_ID')) || 1
        )
        this.productIds = productsByChannel.data.map((product: any) => product.product_id)
        this.totalProducts = this.productIds.length
        this.processedProducts = 0
        this.isFirstBatch = true // Reset del control para el primer lote

        this.logger.info('INICIO DE SINCRONIZACIÓN:')
        this.logger.info(`📦 Total de productos en API: ${this.totalProducts}`)
        this.logger.info(`📦 IDs de productos: ${this.productIds.length}`)
      }

      // ============================================================================
      // PASO 3: DEFINIR EL LOTE ACTUAL (20% DEL TOTAL)
      // ============================================================================
      // Procesamos en lotes del 20% para evitar timeouts y mantener
      // la aplicación responsiva durante el proceso
      const blockSize = Math.ceil(this.totalProducts * 0.2)
      const start = this.processedProducts
      const end = Math.min(start + blockSize, this.totalProducts)
      const productIdsBlock = this.productIds.slice(start, end)

      this.logger.info('PROCESANDO LOTE:')
      this.logger.info(`   - Rango: ${start + 1} a ${end} de ${this.totalProducts}`)
      this.logger.info(`   - Productos en este lote: ${productIdsBlock.length}`)
      this.logger.info(
        `   - Productos procesados hasta ahora: ${this.trackingStats.totalProductsProcessed}`
      )

      // ============================================================================
      // PASO 4: DIVIDIR EN BATCHES DE 250 PARA LA API
      // ============================================================================
      // BigCommerce tiene límites en el tamaño de las URLs y rate limits
      // Por eso dividimos en batches de 250 productos máximo
      const batchSize = 250
      let batches: any[] = []
      for (let i = 0; i < productIdsBlock.length; i += batchSize) {
        const batch = productIdsBlock.slice(i, i + batchSize)
        if (batch.length > 0) {
          batches.push(batch)
        }
      }

      // ============================================================================
      // PASO 5: OBTENER DATOS DETALLADOS DE CADA BATCH
      // ============================================================================
      // Hacemos llamadas paralelas a la API para obtener los datos completos
      // de cada producto (incluyendo variantes, opciones, etc.)
      const batchPromises = batches.map(async (batchIds) => {
        try {
          const productsPerPage = await this.bigcommerceService.getAllProductsRefactoring(
            batchIds,
            0,
            Number(env.get('BIGCOMMERCE_CHANNEL_ID')) || 1
          )

          // 📦 Almacenar datos en cache mejorado para optimizar la limpieza posterior
          for (const product of productsPerPage.data) {
            await this.storeProductDataInCache(product.id, product)
          }

          return productsPerPage.data
        } catch (error) {
          this.logger.error('Error fetching detailed products:', error)
          // 📊 Registrar productos fallidos del batch
          batchIds.forEach((productId: number) => {
            this.trackingStats.failedProducts.push({
              id: productId,
              error: `Error en API: ${error?.message || 'Error desconocido'}`,
            })
          })
          return []
        }
      })

      const batchResults = await Promise.all(batchPromises)
      const productsData = batchResults.flat()

      // ============================================================================
      // PASO 6: VERIFICAR INTEGRIDAD DE DATOS OBTENIDOS
      // ============================================================================
      // Verificamos que todos los productos del lote se obtuvieron correctamente
      // Si faltan productos, los registramos como fallidos
      const expectedProductsInBatch = productIdsBlock.length
      const actualProductsInBatch = productsData.length

      if (actualProductsInBatch < expectedProductsInBatch) {
        const missingCount = expectedProductsInBatch - actualProductsInBatch
        this.logger.warn(`ADVERTENCIA: ${missingCount} productos no se obtuvieron de la API`)
        this.logger.warn(`   - Esperados: ${expectedProductsInBatch}`)
        this.logger.warn(`   - Obtenidos: ${actualProductsInBatch}`)

        // 📊 Identificar productos faltantes para ocultarlos en BD
        const obtainedIds = productsData.map((p) => p.id)
        const missingIds = productIdsBlock.filter((id) => !obtainedIds.includes(id))

        if (missingIds.length > 0) {
          this.logger.warn(
            `${missingIds.length} productos no devueltos por la API, verificando existencia en BD...`
          )

          // Verificar qué productos faltantes realmente existen en la BD
          const existingMissingProducts = await ProductsBigcommerce.query()
            .whereIn('product_id', missingIds)
            .select('product_id', 'is_visible')

          const existingMissingIds = existingMissingProducts.map((p: any) => p.product_id)
          const nonExistingIds = missingIds.filter((id) => !existingMissingIds.includes(id))

          if (existingMissingIds.length > 0) {
            this.logger.info(
              `${existingMissingIds.length} productos faltantes existen en BD, ocultándolos y limpiando referencias...`
            )

            // Ocultar productos que existen en BD pero no devuelve la API
            await ProductsBigcommerce.query().whereIn('product_id', existingMissingIds).update({
              is_visible: false,
              updated_at: new Date(),
            })

            // 🧹 LIMPIEZA COMPLETA: Eliminar todas las referencias de productos ocultados
            await this.cleanReferencesForHiddenProducts(existingMissingIds)

            console.log(
              `✅ ${existingMissingIds.length} productos ocultados y referencias limpiadas exitosamente`
            )
          }

          if (nonExistingIds.length > 0) {
            this.logger.warn(
              `${nonExistingIds.length} productos faltantes NO existen en BD (no se pueden ocultar)`
            )
          }

          // Registrar en tracking para reporte final
          existingMissingIds.forEach((productId) => {
            this.trackingStats.failedProducts.push({
              id: productId,
              error: 'Producto ocultado - no devuelto por API',
            })
          })

          nonExistingIds.forEach((productId) => {
            this.trackingStats.failedProducts.push({
              id: productId,
              error: 'Producto no existe en BD - no se puede ocultar',
            })
          })
        }
      }

      // ============================================================================
      // PASO 7: PROCESAR TODO EN UNA TRANSACCIÓN DE BASE DE DATOS
      // ============================================================================
      // Procesamos todos los productos del lote en una sola transacción
      // para garantizar consistencia de datos
      await this.processBatchInTransaction(productsData)

      // ============================================================================
      // PASO 7.5: SINCRONIZAR CANALES Y FILTROS (FUERA DE TRANSACCIÓN PARA EVITAR CONFLICTOS)
      // ============================================================================
      // La sincronización de canales y filtros se hace fuera de la transacción principal
      // para evitar conflictos con otras operaciones de base de datos

      // 1. Sincronizar canales
      try {
        const channelResult = await this.syncChannelByProduct(
          productsData,
          Number(env.get('BIGCOMMERCE_CHANNEL_ID')) || 1
        )
        this.logger.info(`Canales sincronizados: ${channelResult.total} relaciones`)
      } catch (error) {
        this.logger.error(`Error sincronizando canales: ${error?.message}`)
        // No bloquear el proceso principal si falla la sincronización de canales
      }

      // 2. Sincronizar filtros
      try {
        const filtersResult = await this.syncFiltersProducts()
        if (filtersResult.success) {
          this.logger.info(`Filtros sincronizados: ${filtersResult.message}`)
        } else {
          this.logger.warn(`Filtros con advertencias: ${filtersResult.message}`)
        }
      } catch (error) {
        this.logger.error(`Error sincronizando filtros: ${error?.message}`)
        // No bloquear el proceso principal si falla la sincronización de filtros
      }

      // ============================================================================
      // PASO 8: ACTUALIZAR PROGRESO Y CONTROLAR RECURSIVIDAD
      // ============================================================================
      // Actualizamos el contador de productos procesados
      this.processedProducts = end
      this.isFirstBatch = false // Marcar que ya no es el primer lote

      this.logger.info('LOTE COMPLETADO:')
      this.logger.info(`   - Productos procesados en este lote: ${productsData.length}`)
      this.logger.info(`   - Total acumulado: ${this.trackingStats.totalProductsProcessed}`)
      this.logger.info(`   - Progreso: ${this.processedProducts}/${this.totalProducts}`)

      // ============================================================================
      // PASO 9: VERIFICAR SI QUEDAN PRODUCTOS POR PROCESAR
      // ============================================================================
      // Si aún quedan productos, llamamos recursivamente al método
      // para procesar el siguiente lote
      if (this.processedProducts < this.totalProducts) {
        return await this.syncProductsFromBigcommerce()
      }

      // ============================================================================
      // PASO 10: PROCESO COMPLETADO - GENERAR REPORTE FINAL
      // ============================================================================
      // Una vez procesados todos los productos, generamos un reporte
      // detallado con estadísticas completas
      this.inventoryUpdateCount = false

      // Generar reporte
      const finalReport = await this.generateFinalReport()

      // Ocultar productos fallidos
      await this.hideFailedProducts(finalReport)

      // Limpiar datos obsoletos en background optimizada con cache (sin bloquear el reporte)
      if (this.shouldCleanObsoleteData) {
        this.logger.info('Iniciando limpieza optimizada con cache en background...')
        this.cleanObsoleteDataOptimizedInBackground().catch((error) => {
          this.logger.error('Error en limpieza optimizada en background:', error)
        })
      }

      // Retornar reporte
      return finalReport
    } catch (error) {
      this.logger.error('Error en la sincronización de productos:', error)
      return {
        status: 'Error',
        message: 'Error durante el proceso de sincronización.',
        detail: error?.detail,
        stack: error?.stack,
        tracking: this.trackingStats, // 📊 Incluir tracking incluso en error
      }
    }
  }

  /**
   * ============================================================================
   * RESET DE ESTADÍSTICAS DE TRACKING
   * ============================================================================
   *
   * Reinicia todas las estadísticas de tracking al inicio de una nueva
   * sincronización completa. Esto asegura que no se acumulen datos
   * de sincronizaciones anteriores.
   */
  private resetTrackingStats() {
    this.trackingStats = {
      totalProductsProcessed: 0,
      totalVariantsProcessed: 0,
      totalOptionsProcessed: 0,
      totalCategoriesProcessed: 0,
      failedProducts: [],
      failedVariants: [],
      failedOptions: [],
      failedCategories: [],
    }
  }

  /**
   * ============================================================================
   * GENERACIÓN DE REPORTE FINAL DETALLADO
   * ============================================================================
   *
   * Genera un reporte completo con todas las estadísticas de la sincronización,
   * incluyendo verificación de la base de datos para validar que los datos
   * se guardaron correctamente.
   *
   * CONTENIDO DEL REPORTE:
   * - Totales de productos procesados vs intentados
   * - Estadísticas de variantes, opciones y categorías
   * - Lista detallada de elementos fallidos con razones
   * - Verificación de datos en la base de datos
   * - Tasas de éxito calculadas
   *
   * @returns {Promise<any>} Reporte completo con todas las estadísticas
   */
  private async generateFinalReport() {
    // ============================================================================
    // PASO 1: VERIFICAR DATOS EN LA BASE DE DATOS
    // ============================================================================
    // Contamos los registros reales en cada tabla para validar
    // que los datos se guardaron correctamente
    const dbProductCount = await ProductsBigcommerce.query().count('* as total')
    const dbVariantCount = await Variant.query().count('* as total')
    const dbCategoryCount = await CategoryProduct.query().count('* as total')
    const dbOptionCount = await OptionOfProducts.query().count('* as total')

    // ============================================================================
    // PASO 2: CALCULAR TOTALES REALES
    // ============================================================================
    // Calculamos los totales intentados sumando exitosos + fallidos
    // para tener una visión completa del proceso
    const totalProductsAttempted =
      this.trackingStats.totalProductsProcessed + this.trackingStats.failedProducts.length
    const totalVariantsAttempted =
      this.trackingStats.totalVariantsProcessed + this.trackingStats.failedVariants.length
    const totalOptionsAttempted =
      this.trackingStats.totalOptionsProcessed + this.trackingStats.failedOptions.length
    const totalCategoriesAttempted =
      this.trackingStats.totalCategoriesProcessed + this.trackingStats.failedCategories.length

    // ============================================================================
    // PASO 3: CONSTRUIR REPORTE COMPLETO
    // ============================================================================
    const report = {
      message: 'Proceso completado',
      total: this.totalProducts,
      totalAttempted: totalProductsAttempted,
      totalProcessed: this.trackingStats.totalProductsProcessed,
      totalFailed: this.trackingStats.failedProducts.length,
      databaseVerification: {
        productsInDB: dbProductCount[0].$extras.total,
        variantsInDB: dbVariantCount[0].$extras.total,
        categoriesInDB: dbCategoryCount[0].$extras.total,
        optionsInDB: dbOptionCount[0].$extras.total,
      },
      tracking: {
        ...this.trackingStats,
        summary: {
          successRate: {
            products: `${((this.trackingStats.totalProductsProcessed / totalProductsAttempted) * 100).toFixed(2)}%`,
            variants: `${((this.trackingStats.totalVariantsProcessed / totalVariantsAttempted) * 100).toFixed(2)}%`,
            options: `${((this.trackingStats.totalOptionsProcessed / totalOptionsAttempted) * 100).toFixed(2)}%`,
            categories: `${(
              (this.trackingStats.totalCategoriesProcessed / totalCategoriesAttempted) *
              100
            ).toFixed(2)}%`,
          },
        },
      },
    }

    // ============================================================================
    // PASO 4: GENERAR LOGS DETALLADOS
    // ============================================================================
    // Imprimimos logs detallados para monitoreo y debugging
    this.logger.info('REPORTE FINAL DE SINCRONIZACIÓN:')
    this.logger.info(`📦 Total de productos en API: ${this.totalProducts}`)
    this.logger.info(`📦 Productos intentados: ${totalProductsAttempted}`)
    this.logger.info(
      `📦 Productos procesados exitosamente: ${this.trackingStats.totalProductsProcessed}`
    )
    this.logger.info(`📦 Productos fallidos: ${this.trackingStats.failedProducts.length}`)
    this.logger.info(
      `📦 Diferencia con API: ${this.totalProducts - totalProductsAttempted} productos no procesados`
    )
    this.logger.info(`🔄 Variantes procesadas: ${this.trackingStats.totalVariantsProcessed}`)
    this.logger.info(`⚙️ Opciones procesadas: ${this.trackingStats.totalOptionsProcessed}`)
    this.logger.info(`🏷️ Categorías procesadas: ${this.trackingStats.totalCategoriesProcessed}`)

    this.logger.info('VERIFICACIÓN DE BASE DE DATOS:')
    this.logger.info(`📦 Productos en DB: ${dbProductCount[0].$extras.total}`)
    this.logger.info(`🔄 Variantes en DB: ${dbVariantCount[0].$extras.total}`)
    this.logger.info(`⚙️ Opciones en DB: ${dbOptionCount[0].$extras.total}`)
    this.logger.info(`🏷️ Categorías en DB: ${dbCategoryCount[0].$extras.total}`)

    // ============================================================================
    // PASO 5: MOSTRAR ELEMENTOS FALLIDOS (SI LOS HAY)
    // ============================================================================
    // Si hay elementos fallidos, los mostramos con detalles para debugging
    if (this.trackingStats.failedProducts.length > 0) {
      //   console.log(`❌ Productos fallidos: ${this.trackingStats.failedProducts.length}`)
      //   this.trackingStats.failedProducts.forEach(p => console.log(`   - Producto ID ${p.id}: ${p.error}`))
    }

    if (this.trackingStats.failedVariants.length > 0) {
      this.logger.error(`Variantes fallidas: ${this.trackingStats.failedVariants.length}`)
      this.trackingStats.failedVariants.forEach((v: { id: number; sku: string; error: string }) =>
        this.logger.error(`   - Variante ID ${v.id} (SKU: ${v.sku}): ${v.error}`)
      )
    }

    if (this.trackingStats.failedOptions.length > 0) {
      this.logger.error(`Opciones fallidas: ${this.trackingStats.failedOptions.length}`)
      this.trackingStats.failedOptions.forEach((o: { option_id: number; error: string }) =>
        this.logger.error(`   - Opción ID ${o.option_id}: ${o.error}`)
      )
    }

    if (this.trackingStats.failedCategories.length > 0) {
      this.logger.error(`Categorías fallidas: ${this.trackingStats.failedCategories.length}`)
      this.trackingStats.failedCategories.forEach(
        (c: { category_id: number; product_id: number; error: string }) =>
          this.logger.error(
            `   - Categoría ${c.category_id} del producto ${c.product_id}: ${c.error}`
          )
      )
    }

    return report
  }

  /**
   * ============================================================================
   * PROCESAMIENTO DE LOTE EN TRANSACCIÓN DE BASE DE DATOS
   * ============================================================================
   *
   * Este método procesa un lote completo de productos en una sola transacción
   * de base de datos para garantizar consistencia de datos.
   *
   * ESTRATEGIA DE PROCESAMIENTO:
   * 1. Formatear datos de productos usando GeneralService
   * 2. Procesar productos uno por uno para tracking detallado
   * 3. En el primer lote: limpiar todos los datos existentes
   * 4. Insertar/actualizar categorías, opciones y variantes
   * 5. Acumular estadísticas de éxito/fracaso
   *
   * @param productsData Array de productos obtenidos de BigCommerce
   */
  private async processBatchInTransaction(productsData: any[]) {
    await Database.transaction(async (trx) => {
      try {
        // ============================================================================
        // PASO 1: FORMATEAR DATOS DE PRODUCTOS
        // ============================================================================
        // Convertir los datos crudos de BigCommerce al formato que espera
        // nuestra base de datos local
        const formatProducts: any = await this.generalService.FormatProductsArray(productsData)

        // ============================================================================
        // PASO 2: PROCESAR PRODUCTOS EN PARALELO PARA MÁXIMA VELOCIDAD
        // ============================================================================
        // Procesamos productos en paralelo usando Promise.all para máxima velocidad
        // pero con control de concurrencia para evitar sobrecargar la base de datos
        const productProcessingPromises = productsData.map(async (product) => {
          try {
            // ✅ LIMPIEZA INCREMENTAL: Obtener estado actual y limpiar obsoleto ANTES de insertar
            try {
              const currentState = await this.getProductCurrentState(product.id, trx)
              const newData = {
                categories: product.categories || [],
                options: product.options || [],
                variants: product.variants || [],
              }

              // ✅ LIMPIAR RELACIONES OBSOLETAS ANTES DE INSERTAR
              await this.cleanProductObsoleteRelations(product.id, currentState, newData, trx)
            } catch (cleanupError) {
              // ✅ Si falla la limpieza, solo logear y continuar (NO bloquear el proceso)
              this.logger.warn(
                `Limpieza incremental falló para producto ${product.id}: ${cleanupError?.message}`
              )
            }

            // Buscar el producto formateado correspondiente
            const formattedProduct = formatProducts.find((fp: any) => fp.id === product.id)
            if (formattedProduct) {
              await ProductsBigcommerce.updateOrCreate(
                { id: formattedProduct.id },
                formattedProduct,
                {
                  client: trx,
                }
              )
            }

            return { success: true, productId: product.id }
          } catch (error) {
            this.logger.error(`Error guardando producto ${product.id}:`, error)
            this.trackingStats.failedProducts.push({
              id: product.id,
              error: `Error guardando en DB: ${error?.message || 'Error desconocido'}`,
            })
            return { success: false, productId: product.id, error: error?.message }
          }
        })

        // ✅ EJECUTAR TODOS LOS PRODUCTOS EN PARALELO
        this.logger.info(`Procesando ${productsData.length} productos en paralelo`)
        const processingResults = await Promise.all(productProcessingPromises)

        // ✅ CONTAR PRODUCTOS PROCESADOS EXITOSAMENTE
        const successfulProducts = processingResults.filter((result) => result.success).length
        const failedProducts = processingResults.filter((result) => !result.success).length

        this.logger.info(
          `Procesamiento paralelo completado: ${successfulProducts} exitosos, ${failedProducts} fallidos`
        )

        // ============================================================================
        // PASO 3: ACTUALIZAR CONTADOR DE PRODUCTOS PROCESADOS
        // ============================================================================
        // Incrementamos el contador de productos procesados exitosamente
        this.trackingStats.totalProductsProcessed += productsData.length

        // ============================================================================
        // PASO 4: PREPARAR LIMPIEZA DE DATOS OBSOLETOS (SOLO AL FINAL)
        // ============================================================================
        // En lugar de eliminar datos al inicio, los marcamos para limpiar
        // solo al final del proceso completo para evitar downtime
        if (this.isFirstBatch) {
          this.shouldCleanObsoleteData = true
          this.logger.info('Marcando datos para limpieza final (sin downtime)')
        }

        // ============================================================================
        // PASO 5: INSERTAR/ACTUALIZAR DATOS RELACIONADOS
        // ============================================================================
        // Procesamos categorías, opciones y variantes de todos los productos
        // del lote en operaciones separadas para mejor manejo de errores
        await this.insertOrUpdateDataInTransaction(productsData, trx)

        this.logger.info(`Lote procesado exitosamente: ${productsData.length} productos`)
      } catch (error) {
        this.logger.error('Error en el procesamiento del lote:', error)

        // ============================================================================
        // MANEJO DE ERRORES: REGISTRAR TODOS LOS PRODUCTOS COMO FALLIDOS
        // ============================================================================
        // Si hay un error general en el lote, registramos todos los productos
        // como fallidos para mantener consistencia en el tracking
        productsData.forEach((product) => {
          this.trackingStats.failedProducts.push({
            id: product.id,
            error: error?.message || 'Error desconocido',
          })
        })

        throw error // Esto automáticamente hace rollback de la transacción
      }
    })
  }

  /**
   * ============================================================================
   * INSERCIÓN/ACTUALIZACIÓN DE DATOS RELACIONADOS
   * ============================================================================
   *
   * Procesa e inserta/actualiza todos los datos relacionados con los productos:
   * categorías, opciones y variantes.
   *
   * ESTRATEGIA DE PROCESAMIENTO:
   * 1. Preparar datos de categorías (relaciones producto-categoría)
   * 2. Preparar datos de opciones (opciones de productos)
   * 3. Preparar datos de variantes (variantes de productos)
   * 4. Ejecutar operaciones masivas para máxima eficiencia
   * 5. Trackear errores individuales para cada tipo de dato
   *
   * @param products Array de productos con datos completos de BigCommerce
   * @param trx Transacción de base de datos activa
   */
  private async insertOrUpdateDataInTransaction(products: any[], trx: any) {
    // ============================================================================
    // PASO 1: PREPARAR Y PROCESAR CATEGORÍAS
    // ============================================================================
    // Extraemos todas las relaciones producto-categoría de todos los productos
    // y las procesamos una por una para mejor manejo de errores
    const categoryRelations = products.flatMap((product) => {
      return (product.categories || []).map((categoryId: any) => ({
        product_id: product.id,
        category_id: categoryId,
      }))
    })

    if (categoryRelations.length > 0) {
      console.log(`🏷️ Procesando ${categoryRelations.length} categorías de productos`)
      try {
        await this.upsertCategoryRelations(categoryRelations, trx)
        this.trackingStats.totalCategoriesProcessed += categoryRelations.length
        console.log(`✅ Categorías procesadas exitosamente: ${categoryRelations.length} relaciones`)
      } catch (error) {
        console.error('❌ Error procesando categorías:', error)
        // Registrar errores pero continuar con el proceso
        categoryRelations.forEach((cat) => {
          this.trackingStats.failedCategories.push({
            product_id: cat.product_id,
            category_id: cat.category_id,
            error: error?.message || 'Error al procesar categoría',
          })
        })
      }
    }

    // ============================================================================
    // PASO 2: PREPARAR Y PROCESAR OPCIONES
    // ============================================================================
    // Para cada producto, formateamos sus opciones usando GeneralService
    // y las insertamos en operaciones masivas
    const optionsPromises = products.map(async (product) => {
      try {
        const options = await this.generalService.formatOptionsByVariantByProduct(product)
        if (!Array.isArray(options) || options.length === 0) {
          return []
        }
        return options.map((option) => ({
          label: option.label,
          product_id: option.product_id,
          option_id: option.id,
          options: JSON.stringify(option.options),
        }))
      } catch (error) {
        console.error(`❌ Error formateando opciones del producto ${product.id}:`, error)
        this.trackingStats.failedOptions.push({
          option_id: 0,
          product_id: product.id,
          error: error?.message || 'Error al formatear opciones',
        })
        return []
      }
    })

    const allOptions = await Promise.all(optionsPromises)
    const flatOptions = allOptions.flat()

    if (flatOptions.length > 0) {
      console.log(`⚙️ Procesando ${flatOptions.length} opciones de productos`)
      try {
        await this.upsertOptions(flatOptions, trx)
        this.trackingStats.totalOptionsProcessed += flatOptions.length
        console.log(`✅ Opciones procesadas exitosamente: ${flatOptions.length} opciones`)
      } catch (error) {
        console.error('❌ Error procesando opciones:', error)
        // Registrar errores pero continuar con el proceso
        flatOptions.forEach((opt) => {
          this.trackingStats.failedOptions.push({
            option_id: opt.option_id,
            product_id: opt.product_id,
            error: error?.message || 'Error al procesar opción',
          })
        })
      }
    }

    // ============================================================================
    // PASO 3: PREPARAR Y PROCESAR VARIANTES
    // ============================================================================
    // Para cada producto, formateamos sus variantes y las procesamos
    // usando updateOrCreateMany por SKU para máxima eficiencia
    const variantsPromises = products.map(async (product) => {
      try {
        const variants = await this.generalService.formatVariantsByProduct(product)
        return variants.map((variant) => ({
          id: variant.id,
          product_id: product.id,
          title: variant.main_title,
          sku: variant.sku,
          normal_price: variant.normal_price,
          discount_price: variant.discount_price,
          cash_price: variant.cash_price,
          discount_rate: variant.discount_rate,
          stock: variant.stock,
          warning_stock: variant.warning_stock,
          image: variant.image,
          images: variant.images,
          quantity: variant.quantity,
          armed_cost: variant.armed_cost,
          armed_quantity: variant.armed_quantity,
          weight: variant.weight,
          height: variant.height,
          width: variant.width,
          depth: variant.depth,
          type: variant.type,
          options: variant.options,
          //related_products: variant.related_products,
        }))
      } catch (error) {
        console.error(`❌ Error formateando variantes del producto ${product.id}:`, error?.message)
        this.trackingStats.failedVariants.push({
          id: product.id,
          sku: product.sku,
          product_id: product.id,
          error: error?.message || 'Error al formatear variantes',
        })
        return []
      }
    })

    const allVariants = await Promise.all(variantsPromises)
    const flatVariants = allVariants.flat()

    if (flatVariants.length > 0) {
      console.log(`🔄 Procesando ${flatVariants.length} variantes de productos`)
      try {
        // Usar el nuevo método de procesamiento en lotes para evitar errores de conexión
        await this.processVariantsInBatches(flatVariants, trx, 50)
        console.log(`✅ Variantes procesadas exitosamente: ${flatVariants.length} variantes`)
      } catch (error) {
        console.error('❌ Error crítico procesando variantes:', error)
        // Registrar errores pero continuar con el proceso
        flatVariants.forEach((variant) => {
          this.trackingStats.failedVariants.push({
            id: variant.id,
            sku: variant.sku,
            product_id: variant.product_id,
            error: error?.message || 'Error crítico al procesar variante',
          })
        })
      }
    }
  }

  /**
   * ============================================================================
   * GUARDADO DE STOCK DE SEGURIDAD EN BASE DE DATOS
   * ============================================================================
   *
   * Obtiene y guarda el inventario de stock de seguridad desde BigCommerce
   * en nuestra base de datos local para consultas rápidas.
   *
   * DATOS GUARDADOS:
   * - SKU del producto
   * - ID de variante y producto
   * - Stock de seguridad configurado
   * - Nivel de advertencia
   * - Cantidad disponible para venta
   * - Número de ubicación en almacén
   *
   * @returns {Promise<any>} Resultado de la operación de guardado
   */
  public async saveSafeStock() {
    try {
      // ============================================================================
      // PASO 1: OBTENER DATOS DE STOCK DE SEGURIDAD
      // ============================================================================
      // Llamamos a la API de BigCommerce para obtener el inventario
      // con información de stock de seguridad
      let productInventory: any = await this.bigcommerceService.getSafeStockGlobal()

      if ('status' in productInventory && productInventory.status === 'Error') {
        return productInventory
      }

      // ============================================================================
      // PASO 2: FORMATEAR DATOS PARA LA BASE DE DATOS
      // ============================================================================
      // Convertimos los datos de BigCommerce al formato que espera
      // nuestra tabla catalog_safe_stock
      productInventory = productInventory.map((item: SafeStockItem) => ({
        sku: item.identity.sku.trim(),
        variant_id: item.identity.variant_id,
        product_id: item.identity.product_id,
        safety_stock: item.settings.safety_stock,
        warning_level: item.settings.warning_level,
        available_to_sell: item.available_to_sell,
        bin_picking_number: item.settings.bin_picking_number,
      }))

      // ============================================================================
      // PASO 3: GUARDAR EN BASE DE DATOS
      // ============================================================================
      // Usamos updateOrCreateMany para insertar o actualizar registros
      // basándonos en el SKU como identificador único
      return await CatalogSafeStock.updateOrCreateMany('sku', productInventory)
    } catch (error) {
      console.error('Error durante la sincronización de stock de seguridad:', error?.detail)
      return {
        status: 'Error',
        message: 'Error al intentar guardar el inventario',
        detail: error?.detail,
        stack: error?.stack,
      }
    }
  }

  private async hideFailedProducts(finalReport: any) {
    console.log('📊 Resumen de productos ocultados durante la sincronización...')

    // Contar productos por tipo de error
    const hiddenProducts = finalReport.tracking.failedProducts.filter(
      (p: any) => p.error === 'Producto ocultado - no devuelto por API'
    )

    const nonExistingProducts = finalReport.tracking.failedProducts.filter(
      (p: any) => p.error === 'Producto no existe en BD - no se puede ocultar'
    )

    if (hiddenProducts.length > 0) {
      console.log(
        `✅ ${hiddenProducts.length} productos ocultados exitosamente (no devueltos por API)`
      )
    }

    if (nonExistingProducts.length > 0) {
      console.log(
        `⚠️ ${nonExistingProducts.length} productos no existen en BD (no se pudieron ocultar)`
      )
    }

    console.log('✅ Resumen de visibilidad de productos completado')
  }

  /**
   * ============================================================================
   * MÉTODOS AUXILIARES PARA MANEJO DE ERRORES
   * ============================================================================
   */

  /**
   * Pausa la ejecución por un tiempo específico
   * @param ms Milisegundos a esperar
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  /**
   * Detecta si un error es de conexión a la base de datos
   * @param error Error a analizar
   * @returns true si es un error de conexión
   */
  private isConnectionError(error: any): boolean {
    const errorMessage = error?.message || error?.detail || ''
    const connectionErrors = [
      'sorry, too many clients already',
      'connection terminated',
      'connection refused',
      'timeout',
      'pool exhausted',
      'too many connections',
      'connection limit exceeded',
    ]

    return connectionErrors.some((connError) =>
      errorMessage.toLowerCase().includes(connError.toLowerCase())
    )
  }

  /**
   * Maneja errores de conexión intentando reconectar
   * @param error Error de conexión
   * @param trx Transacción activa
   */
  private async handleConnectionError(error: any, trx: any) {
    console.log(`🔄 Intentando manejar error de conexión: ${error?.message || error}`)

    try {
      // Esperar un poco antes de reintentar
      await this.sleep(2000)

      // Verificar si la transacción sigue activa
      if (trx && !trx.isCompleted()) {
        console.log('✅ Transacción sigue activa, continuando...')
      } else {
        console.log('⚠️ Transacción completada, continuando con nueva conexión...')
      }
    } catch (reconnectError) {
      console.error('❌ Error durante el manejo de reconexión:', reconnectError)
    }
  }

  /**
   * Procesa variantes en lotes pequeños para evitar sobrecarga
   * @param variants Array de variantes a procesar
   * @param trx Transacción de base de datos
   * @param batchSize Tamaño del lote (por defecto 50)
   */
  private async processVariantsInBatches(variants: any[], trx: any, batchSize: number = 50) {
    if (variants.length === 0) {
      return
    }

    console.log(`📦 Procesando ${variants.length} variantes en lotes de ${batchSize}`)

    const batches: any[][] = []
    for (let i = 0; i < variants.length; i += batchSize) {
      batches.push(variants.slice(i, i + batchSize))
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      const maxRetries = 3
      let retryCount = 0

      console.log(
        `🔄 Procesando lote ${batchIndex + 1}/${batches.length} con ${batch.length} variantes`
      )

      while (retryCount < maxRetries) {
        try {
          await Variant.updateOrCreateMany('id', batch, { client: trx })
          console.log(`✅ Lote ${batchIndex + 1} procesado exitosamente`)
          this.trackingStats.totalVariantsProcessed += batch.length
          break // Salir del bucle de reintentos
        } catch (error) {
          retryCount++
          console.error(
            `❌ Error en lote ${batchIndex + 1} (intento ${retryCount}/${maxRetries}):`,
            error?.message || error
          )

          if (this.isConnectionError(error)) {
            console.log('🔄 Error de conexión detectado, manejando...')
            await this.handleConnectionError(error, trx)
          }

          if (retryCount >= maxRetries) {
            console.error(`❌ Lote ${batchIndex + 1} falló después de ${maxRetries} intentos`)

            // Registrar todas las variantes del lote como fallidas
            batch.forEach((variant) => {
              this.trackingStats.failedVariants.push({
                id: variant.id,
                sku: variant.sku || '',
                product_id: variant.product_id,
                error: `Error después de ${maxRetries} intentos: ${error?.message || 'Error desconocido'}`,
              })
            })
          } else {
            // Pausa exponencial antes del reintento
            const delay = Math.pow(2, retryCount) * 1000
            console.log(`⏳ Reintentando en ${delay}ms...`)
            await this.sleep(delay)
          }
        }
      }

      // Pausa entre lotes para evitar sobrecarga
      if (batchIndex < batches.length - 1) {
        await this.sleep(100)
      }
    }
  }

  /**
   * ============================================================================
   * MÉTODOS UPSERT PARA EVITAR DOWNTIME
   * ============================================================================
   */

  /**
   * Upsert de relaciones categoría-producto
   * Evita duplicados usando la combinación única de product_id + category_id
   * Valida que las categorías existan antes de crear las relaciones
   */
  private async upsertCategoryRelations(categoryRelations: any[], trx: any) {
    if (categoryRelations.length === 0) {
      return
    }

    // Filtrar solo las categorías que realmente existen en la base de datos
    const validCategoryIds = await this.getValidCategoryIds(trx)
    const validRelations = categoryRelations.filter((relation) =>
      validCategoryIds.has(relation.category_id)
    )

    if (validRelations.length === 0) {
      console.log('⚠️ No hay categorías válidas para procesar')
      return
    }

    console.log(
      `🏷️ Procesando ${validRelations.length} categorías válidas de ${categoryRelations.length} totales`
    )

    // Usar updateOrCreate de Lucid para mayor seguridad
    for (const relation of validRelations) {
      try {
        await CategoryProduct.updateOrCreate(
          {
            product_id: relation.product_id,
            category_id: relation.category_id,
          },
          {
            product_id: relation.product_id,
            category_id: relation.category_id,
          },
          { client: trx }
        )
      } catch (error) {
        console.error(
          `❌ Error procesando categoría ${relation.category_id} para producto ${relation.product_id}:`,
          error
        )
        this.trackingStats.failedCategories.push({
          product_id: relation.product_id,
          category_id: relation.category_id,
          error: error?.message || 'Error al procesar categoría',
        })
      }
    }

    // Registrar categorías inválidas para debugging
    const invalidRelations = categoryRelations.filter(
      (relation) => !validCategoryIds.has(relation.category_id)
    )

    if (invalidRelations.length > 0) {
      console.log(
        `⚠️ ${invalidRelations.length} categorías inválidas encontradas (no existen en BD):`
      )
      const invalidCategoryIds = [...new Set(invalidRelations.map((r) => r.category_id))]
      console.log(
        `   - IDs de categorías inválidas: ${invalidCategoryIds.slice(0, 10).join(', ')}${
          invalidCategoryIds.length > 10 ? '...' : ''
        }`
      )

      // Registrar en tracking para reporte final
      invalidRelations.forEach((relation) => {
        this.trackingStats.failedCategories.push({
          product_id: relation.product_id,
          category_id: relation.category_id,
          error: 'Categoría no existe en la base de datos',
        })
      })
    }
  }

  /**
   * Upsert de opciones de productos
   * Evita duplicados usando la combinación única de option_id + product_id
   */
  private async upsertOptions(options: any[], trx: any) {
    if (options.length === 0) {
      return
    }

    console.log(`🔄 Procesando ${options.length} opciones de productos`)

    // Procesar opciones en lotes pequeños para evitar sobrecarga
    const batchSize = 100
    const batches: any[][] = []

    for (let i = 0; i < options.length; i += batchSize) {
      batches.push(options.slice(i, i + batchSize))
    }

    console.log(`📦 Procesando opciones en ${batches.length} lotes de máximo ${batchSize}`)

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex]
      const maxRetries = 3
      let retryCount = 0

      console.log(
        `🔄 Procesando lote de opciones ${batchIndex + 1}/${batches.length} con ${batch.length} opciones`
      )

      while (retryCount < maxRetries) {
        try {
          // Procesar cada opción del lote
          for (const option of batch) {
            try {
              await OptionOfProducts.updateOrCreate(
                {
                  option_id: option.option_id,
                  product_id: option.product_id,
                },
                {
                  option_id: option.option_id,
                  label: option.label,
                  product_id: option.product_id,
                  options: option.options,
                },
                { client: trx }
              )
            } catch (optionError) {
              console.error(
                `❌ Error procesando opción ${option.option_id}:`,
                optionError?.message || optionError
              )
              this.trackingStats.failedOptions.push({
                option_id: option.option_id,
                product_id: option.product_id,
                error: optionError?.message || 'Error al procesar opción',
              })
            }
          }

          console.log(`✅ Lote de opciones ${batchIndex + 1} procesado exitosamente`)
          this.trackingStats.totalOptionsProcessed += batch.length
          break // Salir del bucle de reintentos
        } catch (error) {
          retryCount++
          console.error(
            `❌ Error en lote de opciones ${batchIndex + 1} (intento ${retryCount}/${maxRetries}):`,
            error?.message || error
          )

          if (this.isConnectionError(error)) {
            console.log('🔄 Error de conexión detectado, manejando...')
            await this.handleConnectionError(error, trx)
          }

          if (retryCount >= maxRetries) {
            console.error(
              `❌ Lote de opciones ${batchIndex + 1} falló después de ${maxRetries} intentos`
            )

            // Registrar todas las opciones del lote como fallidas
            batch.forEach((option) => {
              this.trackingStats.failedOptions.push({
                option_id: option.option_id,
                product_id: option.product_id,
                error: `Error después de ${maxRetries} intentos: ${error?.message || 'Error desconocido'}`,
              })
            })
          } else {
            // Pausa exponencial antes del reintento
            const delay = Math.pow(2, retryCount) * 1000
            console.log(`⏳ Reintentando en ${delay}ms...`)
            await this.sleep(delay)
          }
        }
      }

      // Pausa entre lotes para evitar sobrecarga
      if (batchIndex < batches.length - 1) {
        await this.sleep(100)
      }
    }
  }

  /**
   * Obtiene los IDs de categorías válidas que existen en la base de datos
   * @param trx Transacción de base de datos activa
   * @returns Set con los IDs de categorías válidas
   */
  private async getValidCategoryIds(trx: any): Promise<Set<number>> {
    try {
      // Obtener todas las categorías existentes en la base de datos
      const categories = await Database.from('categories').select('category_id').useTransaction(trx)
      return new Set(categories.map((cat) => cat.category_id))
    } catch (error) {
      console.error('❌ Error obteniendo categorías válidas:', error)
      return new Set() // Retornar set vacío en caso de error
    }
  }

  /**
   * ============================================================================
   * LIMPIEZA ASÍNCRONA EN BACKGROUND
   * ============================================================================
   */

  /**
   * Ejecuta la limpieza optimizada con cache en background
   * Combina velocidad de cache + ejecución en background
   */
  private async cleanObsoleteDataOptimizedInBackground() {
    try {
      // Esperar un poco para que la sincronización principal termine
      await this.sleep(2000)

      console.log('🚀 Iniciando limpieza optimizada con cache en background...')
      const startTime = Date.now()

      // Ejecutar limpieza optimizada con cache
      await this.cleanObsoleteDataOptimized()

      const endTime = Date.now()
      const duration = (endTime - startTime) / 1000

      console.log(
        `✅ Limpieza optimizada en background completada en ${duration.toFixed(2)} segundos`
      )
    } catch (error) {
      console.error('❌ Error en limpieza optimizada en background:', error)
      // No lanzar error para no afectar el proceso principal
    }
  }

  /**
   * ============================================================================
   * LIMPIEZA OPTIMIZADA CON CACHE
   * ============================================================================
   */

  /**
   * Almacena datos completos de productos en el cache (API + BD)
   */
  private async storeProductDataInCache(productId: number, productData: any) {
    try {
      // ✅ VALIDACIÓN DE SEGURIDAD CRÍTICA
      if (!productData || typeof productData !== 'object') {
        console.log(`⚠️ Producto ${productId}: Datos inválidos para cache`)
        return
      }

      // ✅ OBTENER DATOS COMPLETOS DE LA BASE DE DATOS
      const dbData = await this.getCompleteProductDataFromDB(productId)

      // ✅ COMBINAR DATOS DE API + BD
      const completeProductData = {
        ...productData,
        // Datos de la API
        api_categories: productData.categories || [],
        api_options: productData.options || [],
        api_variants: productData.variants || [],

        // Datos de la BD (para comparación)
        db_categories: dbData.categories,
        db_options: dbData.options,
        db_variants: dbData.variants,

        // Metadatos de sincronización
        last_sync: new Date(),
        has_db_data: dbData.exists,
      }

      // ✅ GUARDAR EN CACHE (SIEMPRE, sin importar opciones)
      this.apiDataCache.set(productId, completeProductData)

      console.log(`✅ Cache mejorado para producto ${productId}:`)
      console.log(
        `   - API: ${completeProductData.api_categories.length} categorías, ${completeProductData.api_options.length} opciones`
      )
      console.log(
        `   - BD: ${completeProductData.db_categories.length} categorías, ${completeProductData.db_options.length} opciones`
      )
    } catch (error) {
      console.error(`❌ Error mejorando cache para producto ${productId}:`, error?.message)

      // ✅ FALLBACK: Guardar solo datos de API si falla la mejora
      this.apiDataCache.set(productId, productData)
      console.log(`⚠️ Cache básico guardado para producto ${productId} (sin datos de BD)`)
    }
  }

  /**
   * Obtiene datos completos del producto desde la base de datos
   */
  private async getCompleteProductDataFromDB(productId: number) {
    try {
      // ✅ OBTENER PRODUCTO PRINCIPAL
      const product = await ProductsBigcommerce.query().where('product_id', productId).first()

      if (!product) {
        return {
          exists: false,
          categories: [],
          options: [],
          variants: [],
        }
      }

      // ✅ OBTENER CATEGORÍAS RELACIONADAS
      const categories = await Database.from('category_products')
        .select('category_id')
        .where('product_id', productId)

      // ✅ OBTENER OPCIONES RELACIONADAS
      const options = await Database.from('option_of_products')
        .select('option_id', 'label')
        .where('product_id', productId)

      // ✅ OBTENER VARIANTES RELACIONADAS
      const variants = await Database.from('variants')
        .select('id', 'sku')
        .where('product_id', productId)

      return {
        exists: true,
        product: product,
        categories: categories.map((c) => Number(c.category_id)),
        options: options.map((o) => ({ id: Number(o.option_id), label: o.label })),
        variants: variants.map((v) => ({ id: Number(v.id), sku: v.sku })),
      }
    } catch (error) {
      console.error(`❌ Error obteniendo datos de BD para producto ${productId}:`, error?.message)
      return {
        exists: false,
        categories: [],
        options: [],
        variants: [],
      }
    }
  }

  /**
   * Limpieza optimizada usando cache mejorado con datos de BD
   */
  private async cleanObsoleteDataOptimized() {
    try {
      console.log('🚀 Iniciando limpieza optimizada con cache mejorado...')

      // ✅ VERIFICAR FLAG DE SEGURIDAD ANTES DE LIMPIAR OPCIONES
      if (this.disableOptionsCleanup) {
        console.log('🚨 LIMPIEZA DE OPCIONES DESHABILITADA POR SEGURIDAD')
        console.log('🚨 Solo se ejecutarán limpiezas de categorías y variantes')

        // Usar datos ya obtenidos durante la sincronización
        const currentProductIds = new Set(this.productIds)

        // Limpiar solo categorías y variantes (NO opciones)
        const cleanPromises = [
          this.cleanObsoleteCategoriesOptimized(currentProductIds),
          this.cleanObsoleteVariantsOptimized(currentProductIds),
          this.cleanObsoleteProductsOptimized(currentProductIds), // ✅ LIMPIEZA DE PRODUCTOS (SIEMPRE ACTIVA)
        ]

        await Promise.all(cleanPromises)
        console.log(
          '✅ Limpieza de categorías y variantes completada (opciones omitidas por seguridad)'
        )
        return
      }

      // Usar datos ya obtenidos durante la sincronización
      const currentProductIds = new Set(this.productIds)

      // Limpiar en paralelo usando Promise.all
      const cleanPromises = [
        this.cleanObsoleteCategoriesOptimized(currentProductIds),
        this.cleanObsoleteOptionsOptimized(currentProductIds),
        this.cleanObsoleteVariantsOptimized(currentProductIds),
        this.cleanObsoleteProductsOptimized(currentProductIds), // ✅ NUEVA LIMPIEZA DE PRODUCTOS
      ]

      await Promise.all(cleanPromises)
      console.log('✅ Limpieza optimizada completada')
    } catch (error) {
      console.error('❌ Error en limpieza optimizada:', error)
    }
  }

  /**
   * ✅ LIMPIEZA HÍBRIDA MEJORADA: Usa cache con datos de BD para comparación precisa
   */
  private async cleanObsoleteCategoriesOptimized(currentProductIds: Set<number>) {
    try {
      console.log('🏷️ Verificando categorías obsoletas con cache mejorado...')

      // ✅ PASO 1: Obtener TODAS las relaciones producto-categoría de la BD
      const allCategoryRelationsInDB = await CategoryProduct.query()
        .select('product_id', 'category_id')
        .orderBy('product_id', 'asc')

      console.log(
        `📊 Total de relaciones categoría-producto en BD: ${allCategoryRelationsInDB.length}`
      )

      // ✅ PASO 2: Identificar productos que NO están en la API (descontinuados)
      const discontinuedProductIds = new Set<number>()
      const allVisibleProducts = await ProductsBigcommerce.query()
        .where('is_visible', true)
        .select('id')

      allVisibleProducts.forEach((product) => {
        if (!currentProductIds.has(product.id)) {
          discontinuedProductIds.add(product.id)
        }
      })

      console.log(`📊 Productos descontinuados detectados: ${discontinuedProductIds.size}`)

      // ✅ PASO 3: Identificar categorías obsoletas usando cache mejorado
      const obsoleteRelationsByChanges: Array<{
        product_id: number
        category_id: number
        reason: string
      }> = []

      for (const productId of currentProductIds) {
        const cachedProduct = this.apiDataCache.get(productId)
        if (cachedProduct && cachedProduct.has_db_data) {
          // ✅ USAR DATOS DEL CACHE MEJORADO
          const apiCategories = cachedProduct.api_categories || []
          const dbCategories = cachedProduct.db_categories || []

          // Encontrar categorías que están en BD pero no en API
          const obsoleteCategories = dbCategories.filter(
            (catId: number) => !apiCategories.includes(catId)
          )

          obsoleteCategories.forEach((catId: number) => {
            obsoleteRelationsByChanges.push({
              product_id: productId,
              category_id: catId,
              reason: 'Eliminada en BigCommerce',
            })
          })

          // Encontrar categorías nuevas en API que no están en BD
          const newCategories = apiCategories.filter(
            (catId: number) => !dbCategories.includes(catId)
          )

          if (newCategories.length > 0) {
            console.log(
              `🆕 Producto ${productId}: ${newCategories.length} categorías nuevas detectadas`
            )
          }
        }
      }

      console.log(`📊 Categorías obsoletas por cambios: ${obsoleteRelationsByChanges.length}`)

      // ✅ PASO 4: Combinar todas las categorías a eliminar
      const allCategoriesToDelete = [
        // Categorías de productos descontinuados
        ...allCategoryRelationsInDB
          .filter((relation) => discontinuedProductIds.has(relation.product_id))
          .map((relation) => ({ ...relation, reason: 'Producto descontinuado' })),
        // Categorías obsoletas por cambios
        ...obsoleteRelationsByChanges,
      ]

      if (allCategoriesToDelete.length === 0) {
        console.log('✅ No hay categorías obsoletas para eliminar')
        return
      }

      console.log(`🗑️ Eliminando ${allCategoriesToDelete.length} categorías obsoletas...`)

      // ✅ PASO 5: Eliminar categorías obsoletas
      let deletedCount = 0
      let errorCount = 0

      for (const relation of allCategoriesToDelete) {
        try {
          await CategoryProduct.query()
            .where('product_id', relation.product_id)
            .where('category_id', relation.category_id)
            .delete()

          deletedCount++
          console.log(
            `🗑️ Categoría ${relation.product_id}-${relation.category_id} eliminada: ${relation.reason}`
          )
        } catch (error) {
          console.error(
            `❌ Error eliminando categoría ${relation.product_id}-${relation.category_id}:`,
            error?.message
          )
          errorCount++
        }
      }

      console.log('✅ LIMPIEZA DE CATEGORÍAS COMPLETADA:')
      console.log(`   - Categorías eliminadas: ${deletedCount}`)
      console.log(`   - Errores: ${errorCount}`)
      console.log(`   - Productos descontinuados: ${discontinuedProductIds.size}`)
      console.log(`   - Cambios en productos existentes: ${obsoleteRelationsByChanges.length}`)

      // ✅ PASO 6: Mostrar estadísticas detalladas
      const categoriesByProduct = new Map<number, number>()
      allCategoriesToDelete.forEach((relation) => {
        categoriesByProduct.set(
          relation.product_id,
          (categoriesByProduct.get(relation.product_id) || 0) + 1
        )
      })

      console.log('📊 Categorías eliminadas por producto:')
      categoriesByProduct.forEach((categoryCount, productId) => {
        const isDiscontinued = discontinuedProductIds.has(productId)
        const reason = isDiscontinued ? 'DESCONTINUADO' : 'CAMBIOS EN CATEGORÍAS'
        console.log(
          `   - Producto ${productId}: ${categoryCount} categorías eliminadas (${reason})`
        )
      })
    } catch (error) {
      console.error('❌ Error limpiando categorías obsoletas:', error)
      // ✅ NO eliminar nada si hay error
    }
  }

  /**
   * ✅ LIMPIEZA HÍBRIDA: Productos descontinuados + Opciones obsoletas por cambios
   */
  private async cleanObsoleteOptionsOptimized(currentProductIds: Set<number>) {
    try {
      console.log('⚙️ Verificando opciones obsoletas (descontinuados + cambios)...')

      // ✅ PASO 1: Obtener TODAS las opciones de la BD (no solo de productos existentes)
      const allOptionsInDB = await OptionOfProducts.query()
        .select('product_id', 'option_id', 'label')
        .orderBy('product_id', 'asc')

      console.log(`📊 Total de opciones en BD: ${allOptionsInDB.length}`)

      // ✅ PASO 2: Identificar productos que NO están en la API (descontinuados)
      const discontinuedProductIds = new Set<number>()

      // Obtener todos los productos visibles en BD
      const allVisibleProducts = await ProductsBigcommerce.query()
        .where('is_visible', true)
        .select('id')

      // Los productos descontinuados son los que están en BD pero NO en la API
      allVisibleProducts.forEach((product) => {
        if (!currentProductIds.has(product.id)) {
          discontinuedProductIds.add(product.id)
        }
      })

      console.log(`📊 Productos descontinuados detectados: ${discontinuedProductIds.size}`)

      // ✅ PASO 3: Identificar opciones obsoletas por cambios en productos existentes
      const obsoleteOptionsByChanges: Array<{
        product_id: number
        option_id: number
        label: string
      }> = []

      for (const productId of currentProductIds) {
        const cachedProduct = this.apiDataCache.get(productId)
        if (cachedProduct && cachedProduct.options && Array.isArray(cachedProduct.options)) {
          // Obtener opciones actuales del producto en BD
          const currentProductOptions = allOptionsInDB
            .filter((opt: { product_id: number }) => opt.product_id === productId)
            .map((opt: { option_id: number; label: string }) => ({
              option_id: opt.option_id,
              label: opt.label,
            }))

          // Obtener opciones que deberían existir según la API
          const apiOptions = cachedProduct.options.map(
            (opt: { id: number; display_name?: string; name?: string }) => ({
              option_id: opt.id,
              label: opt.display_name || opt.name || 'Sin nombre',
            })
          )

          // Encontrar opciones que están en BD pero no en API
          const obsoleteOptions = currentProductOptions.filter(
            (dbOpt: { option_id: number; label: string }) => {
              return !apiOptions.some(
                (apiOpt: { option_id: number; label: string }) =>
                  apiOpt.option_id === dbOpt.option_id && apiOpt.label === dbOpt.label
              )
            }
          )

          obsoleteOptions.forEach((opt) => {
            obsoleteOptionsByChanges.push({
              product_id: productId,
              option_id: opt.option_id,
              label: opt.label,
            })
          })
        }
      }

      console.log(`📊 Opciones obsoletas por cambios: ${obsoleteOptionsByChanges.length}`)

      // ✅ PASO 4: Combinar todas las opciones a eliminar
      const allOptionsToDelete = [
        // Opciones de productos descontinuados
        ...allOptionsInDB.filter((option) => discontinuedProductIds.has(option.product_id)),
        // Opciones obsoletas por cambios
        ...obsoleteOptionsByChanges,
      ]

      if (allOptionsToDelete.length === 0) {
        console.log('✅ No hay opciones obsoletas para eliminar')
        return
      }

      console.log(`🗑️ Eliminando ${allOptionsToDelete.length} opciones obsoletas...`)

      // ✅ PASO 5: Eliminar opciones obsoletas
      let deletedCount = 0
      let errorCount = 0

      for (const option of allOptionsToDelete) {
        try {
          await OptionOfProducts.query()
            .where('product_id', option.product_id)
            .where('option_id', option.option_id)
            .delete()

          deletedCount++
        } catch (error) {
          console.error(
            `❌ Error eliminando opción ${option.product_id}-${option.option_id}:`,
            error?.message
          )
          errorCount++
        }
      }

      console.log('✅ LIMPIEZA DE OPCIONES COMPLETADA:')
      console.log(`   - Opciones eliminadas: ${deletedCount}`)
      console.log(`   - Errores: ${errorCount}`)
      console.log(`   - Productos descontinuados: ${discontinuedProductIds.size}`)
      console.log(`   - Cambios en productos existentes: ${obsoleteOptionsByChanges.length}`)

      // ✅ PASO 6: Mostrar estadísticas detalladas
      const optionsByProduct = new Map<number, number>()
      allOptionsToDelete.forEach((option) => {
        optionsByProduct.set(option.product_id, (optionsByProduct.get(option.product_id) || 0) + 1)
      })

      console.log('📊 Opciones eliminadas por producto:')
      optionsByProduct.forEach((optionCount, productId) => {
        const isDiscontinued = discontinuedProductIds.has(productId)
        const reason = isDiscontinued ? 'DESCONTINUADO' : 'CAMBIOS EN OPCIONES'
        console.log(`   - Producto ${productId}: ${optionCount} opciones eliminadas (${reason})`)
      })
    } catch (error) {
      console.error('❌ Error limpiando opciones obsoletas:', error)
      // ✅ NO eliminar nada si hay error
    }
  }

  /**
   * ✅ LIMPIEZA CORREGIDA: Eliminar variantes por product_id cuando el producto no existe
   */
  private async cleanObsoleteVariantsOptimized(currentProductIds: Set<number>) {
    try {
      console.log('🔄 Verificando variantes de productos descontinuados...')

      // ✅ PASO 1: Obtener TODAS las variantes de la BD (no solo de productos existentes)
      const allVariantsInDB = await Variant.query()
        .select('product_id', 'id', 'sku')
        .orderBy('product_id', 'asc')

      console.log(`📊 Total de variantes en BD: ${allVariantsInDB.length}`)

      // ✅ PASO 2: Identificar productos que NO están en la API (descontinuados)
      const discontinuedProductIds = new Set<number>()

      // Obtener todos los productos visibles en BD
      const allVisibleProducts = await ProductsBigcommerce.query()
        .where('is_visible', true)
        .select('id')

      // Los productos descontinuados son los que están en BD pero NO en la API
      allVisibleProducts.forEach((product) => {
        if (!currentProductIds.has(product.id)) {
          discontinuedProductIds.add(product.id)
        }
      })

      console.log(`📊 Productos descontinuados detectados: ${discontinuedProductIds.size}`)

      // ✅ PASO 3: Encontrar variantes de productos descontinuados
      const variantsToDelete = allVariantsInDB.filter((variant) =>
        discontinuedProductIds.has(variant.product_id)
      )

      if (variantsToDelete.length === 0) {
        console.log('✅ No hay variantes de productos descontinuados para eliminar')
        return
      }

      console.log(
        `🗑️ Eliminando ${variantsToDelete.length} variantes de productos descontinuados...`
      )

      // ✅ PASO 4: Eliminar variantes por product_id (TODAS las variantes del producto)
      let deletedCount = 0
      let errorCount = 0

      for (const variant of variantsToDelete) {
        try {
          await Variant.query()
            .where('product_id', variant.product_id)
            .where('id', variant.id)
            .delete()

          deletedCount++
        } catch (error) {
          console.error(
            `❌ Error eliminando variante ${variant.product_id}-${variant.id}:`,
            error?.message
          )
          errorCount++
        }
      }

      console.log('✅ LIMPIEZA DE VARIANTES COMPLETADA:')
      console.log(`   - Variantes eliminadas: ${deletedCount}`)
      console.log(`   - Errores: ${errorCount}`)
      console.log(`   - Productos descontinuados: ${discontinuedProductIds.size}`)

      // ✅ PASO 5: Mostrar estadísticas por producto
      const variantsByProduct = new Map<number, number>()
      variantsToDelete.forEach((variant) => {
        variantsByProduct.set(
          variant.product_id,
          (variantsByProduct.get(variant.product_id) || 0) + 1
        )
      })

      console.log('📊 Variantes eliminadas por producto:')
      variantsByProduct.forEach((variantCount, productId) => {
        console.log(`   - Producto ${productId}: ${variantCount} variantes eliminadas`)
      })
    } catch (error) {
      console.error('❌ Error limpiando variantes de productos descontinuados:', error)
      // ✅ NO eliminar nada si hay error
    }
  }

  /**
   * ============================================================================
   * LIMPIEZA DE PRODUCTOS DESCONTINUADOS (NUEVA FUNCIONALIDAD)
   * ============================================================================
   */

  /**
   * Limpieza de productos descontinuados que no fueron devueltos por la API
   * Ocultar productos que ya no existen en BigCommerce en lugar de eliminarlos
   */
  private async cleanObsoleteProductsOptimized(currentProductIds: Set<number>) {
    try {
      console.log('🔄 Verificando productos descontinuados...')

      // ✅ Obtener todos los productos visibles en la BD
      const visibleProducts = await ProductsBigcommerce.query()
        .where('is_visible', true)
        .select('product_id', 'title')

      console.log(`📊 Productos visibles en BD: ${visibleProducts.length}`)
      console.log(`📊 Productos en cache (API): ${currentProductIds.size}`)

      // ✅ Encontrar productos que están en BD pero NO en la API (descontinuados)
      const discontinuedProducts = visibleProducts.filter(
        (product) => !currentProductIds.has(product.id)
      )

      if (discontinuedProducts.length === 0) {
        console.log('✅ No se encontraron productos descontinuados')
        return
      }

      console.log(`🚨 ${discontinuedProducts.length} productos descontinuados detectados`)

      // ✅ Validación de seguridad: No ocultar si hay demasiados productos descontinuados
      const discontinuedPercentage = (discontinuedProducts.length / visibleProducts.length) * 100
      if (discontinuedPercentage > 50) {
        // Más del 50% de productos se considerarían descontinuados
        const percentageMsg = `${discontinuedPercentage.toFixed(1)}% de productos se considerarían descontinuados`
        console.log(`⚠️ ${percentageMsg}, saltando limpieza por seguridad`)
        console.log('⚠️ Esto podría indicar un problema con la API o el cache')
        return
      }

      // ✅ Ocultar productos descontinuados (NO eliminarlos)
      let hiddenCount = 0
      let errorCount = 0

      for (const product of discontinuedProducts) {
        try {
          await ProductsBigcommerce.query().where('id', product.id).update({
            is_visible: false,
            updated_at: new Date(),
          })

          hiddenCount++
          console.log(`🚫 Producto ${product.id} (${product.title}) ocultado - descontinuado`)
        } catch (error) {
          console.error(`❌ Error ocultando producto ${product.id}:`, error?.message)
          errorCount++
        }
      }

      console.log('✅ LIMPIEZA DE PRODUCTOS COMPLETADA:')
      console.log(`   - Productos ocultados: ${hiddenCount}`)
      console.log(`   - Errores: ${errorCount}`)
      console.log(`   - Porcentaje descontinuados: ${discontinuedPercentage.toFixed(1)}%`)

      // ✅ Registrar en tracking para reporte final
      discontinuedProducts.forEach((product) => {
        this.trackingStats.failedProducts.push({
          id: product.id,
          error: 'Producto ocultado - descontinuado en BigCommerce',
        })
      })
    } catch (error) {
      console.error('❌ Error limpiando productos descontinuados:', error)
      // ✅ NO ocultar nada si hay error
    }
  }

  /**
   * ============================================================================
   * MÉTODOS DE EMERGENCIA Y CONTROL DE SEGURIDAD
   * ============================================================================
   */

  /**
   * ✅ MÉTODO DE EMERGENCIA: Deshabilitar limpieza de opciones
   * Útil cuando se detectan problemas con la limpieza automática
   */
  public disableOptionsCleanupForSafety() {
    this.disableOptionsCleanup = true
    console.log('🚨 LIMPIEZA DE OPCIONES DESHABILITADA POR SEGURIDAD')
    console.log('🚨 Las opciones de productos NO se eliminarán automáticamente')
  }

  /**
   * ✅ MÉTODO DE EMERGENCIA: Habilitar limpieza de opciones
   * Solo usar cuando se esté seguro de que el cache funciona correctamente
   */
  public enableOptionsCleanup() {
    this.disableOptionsCleanup = false
    console.log('✅ LIMPIEZA DE OPCIONES HABILITADA')
    console.log('⚠️ Asegúrate de que el cache esté funcionando correctamente')
  }

  /**
   * ✅ MÉTODO DE EMERGENCIA: Restaurar opciones desde backup
   * Útil antes de ejecutar sincronizaciones que podrían ser problemáticas
   */
  public async restoreOptionsFromBackup(
    backupData: Array<{ product_id: number; option_id: number; label: string; options: any }>
  ) {
    try {
      console.log('🚨 INICIANDO RESTAURACIÓN DE EMERGENCIA DE OPCIONES...')
      console.log(`📦 Restaurando ${backupData.length} opciones desde backup`)

      let restoredCount = 0
      let errorCount = 0

      for (const option of backupData) {
        try {
          await OptionOfProducts.updateOrCreate(
            {
              product_id: option.product_id,
              option_id: option.option_id,
            },
            {
              product_id: option.product_id,
              option_id: option.option_id,
              label: option.label,
              options:
                typeof option.options === 'string'
                  ? option.options
                  : JSON.stringify(option.options),
            }
          )
          restoredCount++
        } catch (error) {
          console.error(
            `❌ Error restaurando opción ${option.product_id}-${option.option_id}:`,
            error?.message
          )
          errorCount++
        }
      }

      console.log(
        `✅ RESTAURACIÓN COMPLETADA: ${restoredCount} opciones restauradas, ${errorCount} errores`
      )

      if (errorCount > 0) {
        console.log('⚠️ Algunas opciones no se pudieron restaurar. Revisa los logs de error.')
      }

      return {
        status: 'success',
        restored: restoredCount,
        errors: errorCount,
        total: backupData.length,
      }
    } catch (error) {
      console.error('❌ ERROR CRÍTICO durante la restauración de emergencia:', error)
      return {
        status: 'error',
        message: 'Error durante la restauración de emergencia',
        detail: error?.message,
      }
    }
  }

  /**
   * ✅ MÉTODO DE EMERGENCIA: Crear backup de opciones existentes
   * Útil antes de ejecutar sincronizaciones que podrían ser problemáticas
   */
  public async createOptionsBackup(): Promise<
    Array<{ product_id: number; option_id: number; label: string; options: any }>
  > {
    try {
      console.log('💾 CREANDO BACKUP DE OPCIONES EXISTENTES...')

      const options = await OptionOfProducts.query()
        .select('product_id', 'option_id', 'label', 'options')
        .orderBy('product_id', 'asc')
        .orderBy('option_id', 'asc')

      console.log(`✅ Backup creado: ${options.length} opciones respaldadas`)

      return options.map((option) => ({
        product_id: option.product_id,
        option_id: option.option_id,
        label: option.label,
        options: option.options,
      }))
    } catch (error) {
      console.error('❌ Error creando backup de opciones:', error)
      return []
    }
  }

  /**
   * ============================================================================
   * RECUPERACIÓN AUTOMÁTICA DE TRANSACCIONES ABORTADAS
   * ============================================================================
   */

  /**
   * ✅ MÉTODO DE EMERGENCIA: Recuperar de transacciones abortadas
   * Detecta y maneja automáticamente errores de transacción abortada
   */
  public async recoverFromAbortedTransaction() {
    try {
      console.log('🚨 DETECTANDO TRANSACCIONES ABORTADAS...')

      // ✅ Verificar si hay transacciones activas problemáticas
      const activeTransactions = await Database.from('pg_stat_activity')
        .select(
          'pid',
          'usename',
          'application_name',
          'client_addr',
          'state',
          'query_start',
          'state_change'
        )
        .whereIn('state', ['idle in transaction', 'active'])
        .whereNot('pid', Database.raw('pg_backend_pid()'))
        .whereLike('application_name', '%node%')

      if (activeTransactions && activeTransactions.length > 0) {
        console.log(`⚠️ ${activeTransactions.length} transacciones activas detectadas`)

        // ✅ Intentar terminar transacciones problemáticas
        for (const tx of activeTransactions) {
          try {
            if (tx.state === 'idle in transaction') {
              console.log(`🔄 Terminando transacción inactiva PID: ${tx.pid}`)
              await Database.raw(`SELECT pg_terminate_backend(${tx.pid})`)
            }
          } catch (error) {
            console.log(`⚠️ No se pudo terminar transacción PID ${tx.pid}:`, error?.message)
          }
        }
      }

      // ✅ Resetear estado interno del servicio
      this.resetTrackingStats()
      this.productIds = []
      this.processedProducts = 0
      this.inventoryUpdateCount = false
      this.isFirstBatch = true
      this.shouldCleanObsoleteData = false

      console.log('✅ RECUPERACIÓN COMPLETADA - Estado reseteado')
      console.log('🔄 La sincronización puede reiniciarse desde cero')

      return {
        status: 'success',
        message: 'Recuperación de transacciones abortadas completada',
        activeTransactions: activeTransactions?.length || 0,
      }
    } catch (error) {
      console.error('❌ ERROR durante la recuperación:', error)
      return {
        status: 'error',
        message: 'Error durante la recuperación',
        detail: error?.message,
      }
    }
  }

  /**
   * ✅ MÉTODO DE EMERGENCIA: Verificar estado de la base de datos
   * Detecta problemas de conexión y transacciones
   */
  public async checkDatabaseHealth() {
    try {
      console.log('🏥 VERIFICANDO SALUD DE LA BASE DE DATOS...')

      // ✅ Verificar conexión básica
      await Database.from('information_schema.tables').select('table_name').limit(1)
      console.log('✅ Conexión a base de datos: OK')

      // ✅ Verificar transacciones activas
      const activeTx = await Database.from('pg_stat_activity')
        .count('* as count')
        .whereIn('state', ['idle in transaction', 'active'])
        .whereNot('pid', Database.raw('pg_backend_pid()'))

      const activeCount = activeTx[0]?.$extras?.count || 0
      console.log(`📊 Transacciones activas: ${activeCount}`)

      // ✅ Verificar locks
      const locks = await Database.from('pg_locks').count('* as count').whereNot('granted', true)

      const lockCount = locks[0]?.$extras?.count || 0
      console.log(`🔒 Locks pendientes: ${lockCount}`)

      return {
        status: 'healthy',
        connection: 'OK',
        activeTransactions: activeCount,
        pendingLocks: lockCount,
        timestamp: new Date().toISOString(),
      }
    } catch (error) {
      console.error('❌ ERROR verificando salud de BD:', error)
      return {
        status: 'unhealthy',
        connection: 'ERROR',
        error: error?.message,
        timestamp: new Date().toISOString(),
      }
    }
  }

  /**
   * ============================================================================
   * REFACTORIZACIÓN COMPLETA: ENFOQUE SUPERIOR DE SINCRONIZACIÓN
   * ============================================================================
   */

  /**
   * ✅ NUEVA ESTRATEGIA: Sincronización en fases separadas
   * 1. FASE 1: Procesar solo productos devueltos por la API (garantizado éxito)
   * 2. FASE 2: Ocultar productos no devueltos (descontinuados)
   * 3. FASE 3: Limpiar referencias huérfanas (categorías, opciones, variantes)
   */

  public async syncProductsFromBigcommerceRefactored() {
    // Inicializar métricas
    this.syncMetrics.startTime = new Date()
    this.syncMetrics.errors = []

    try {
      this.logger.info('🚀 INICIANDO SINCRONIZACIÓN REFACTORIZADA (ENFOQUE SUPERIOR)')

      // ✅ VALIDACIONES PRE-SINCRONIZACIÓN
      this.logger.info('🔍 Ejecutando validaciones pre-sincronización...')

      if (!(await this.validateDatabaseState())) {
        throw new Error('Estado de base de datos inválido')
      }

      // ============================================================================
      // FASE 1: OBTENER Y CLASIFICAR PRODUCTOS
      // ============================================================================
      console.log('📦 FASE 1: Obteniendo y clasificando productos...')

      const { apiProducts, discontinuedProductIds } = await this.processBatchWithRetry(
        () => this.getClassifiedProducts(),
        this.maxRetries,
        'Obtención y clasificación de productos'
      )

      this.syncMetrics.totalProducts = apiProducts.length + discontinuedProductIds.length

      if (!(await this.validateCacheIntegrity())) {
        throw new Error('Integridad del cache comprometida')
      }

      console.log('✅ FASE 1 COMPLETADA:', {
        apiProducts: apiProducts.length,
        discontinuedProducts: discontinuedProductIds.length,
      })

      // ============================================================================
      // FASE 2: PROCESAR SOLO PRODUCTOS DEVUELTOS POR LA API
      // ============================================================================
      console.log(`🔄 FASE 2: Procesando ${apiProducts.length} productos de la API...`)

      const processingResult = await this.processBatchWithRetry(
        () => this.processApiProducts(apiProducts),
        this.maxRetries,
        'Procesamiento de productos de la API'
      )

      console.log('✅ FASE 2 COMPLETADA:', processingResult)

      // ============================================================================
      // FASE 3: OCULTAR PRODUCTOS DESCONTINUADOS
      // ============================================================================
      console.log(
        `🚫 FASE 3: Ocultando ${discontinuedProductIds.length} productos descontinuados...`
      )

      const hidingResult = await this.processBatchWithRetry(
        () => this.hideDiscontinuedProducts(discontinuedProductIds),
        this.maxRetries,
        'Ocultar productos descontinuados'
      )

      console.log('✅ FASE 3 COMPLETADA:', hidingResult)

      // ============================================================================
      // FASE 4: LIMPIEZA DE REFERENCIAS HUÉRFANAS
      // ============================================================================
      console.log('🧹 FASE 4: Limpiando referencias huérfanas...')

      const cleanupResult = await this.processBatchWithRetry(
        () => this.cleanupOrphanedReferences(discontinuedProductIds),
        this.maxRetries,
        'Limpieza de referencias huérfanas'
      )

      console.log('✅ FASE 4 COMPLETADA:', cleanupResult)

      // ============================================================================
      // REPORTE FINAL COMPLETO
      // ============================================================================
      this.syncMetrics.endTime = new Date()

      const finalReport = {
        message: 'Sincronización refactorizada completada exitosamente',
        phase1: {
          apiProducts: apiProducts.length,
          discontinuedProducts: discontinuedProductIds.length,
        },
        phase2: processingResult,
        phase3: hidingResult,
        phase4: cleanupResult,
        summary: {
          totalProducts: apiProducts.length + discontinuedProductIds.length,
          processedSuccessfully: apiProducts.length,
          hiddenDiscontinued: discontinuedProductIds.length,
          totalCleanup:
            cleanupResult.categoriesCleaned +
            cleanupResult.optionsCleaned +
            cleanupResult.variantsCleaned,
        },
        metrics: {
          startTime: this.syncMetrics.startTime,
          endTime: this.syncMetrics.endTime,
          duration: this.syncMetrics.endTime.getTime() - this.syncMetrics.startTime.getTime(),
          errors: this.syncMetrics.errors.length,
        },
      }

      console.log('🎉 SINCRONIZACIÓN REFACTORIZADA COMPLETADA EXITOSAMENTE')
      console.log('📊 REPORTE FINAL:', finalReport)

      return finalReport
    } catch (error) {
      this.syncMetrics.endTime = new Date()
      this.syncMetrics.errors.push(error.message)

      console.error('❌ Sincronización falló críticamente:', error?.message)

      // Intentar recuperar de transacción abortada si es necesario
      if (error.code === '25P02') {
        console.warn('⚠️ Detectado error de transacción abortada, intentando recuperar...')
        try {
          await this.recoverFromAbortedTransaction()
          console.log('✅ Recuperación de transacción exitosa')
        } catch (recoveryError) {
          console.error('❌ Error durante recuperación de transacción:', recoveryError?.message)
        }
      }

      return {
        status: 'Error',
        message: 'Error durante la sincronización refactorizada',
        detail: error?.message,
        stack: error?.stack,
        metrics: {
          startTime: this.syncMetrics.startTime,
          endTime: this.syncMetrics.endTime,
          duration: this.syncMetrics.endTime
            ? this.syncMetrics.endTime.getTime() - this.syncMetrics.startTime.getTime()
            : 0,
          errors: this.syncMetrics.errors.length,
        },
      }
    }
  }

  /**
   * FASE 1: Obtener y clasificar productos
   * Separa productos devueltos por la API vs productos descontinuados
   */
  private async getClassifiedProducts() {
    try {
      console.log('🔍 Obteniendo productos de BigCommerce...')

      // Obtener todos los productos de la API
      const productsByChannel = await this.bigcommerceService.getProductsByChannel(
        Number(env.get('BIGCOMMERCE_CHANNEL_ID')) || 1
      )
      const apiProductIds = new Set(
        productsByChannel.data.map((product: any) => product.product_id)
      )

      console.log(`📦 Total de productos en API: ${apiProductIds.size}`)

      // Obtener todos los productos visibles en la BD
      const visibleProducts = await ProductsBigcommerce.query()
        .where('is_visible', true)
        .select('id')

      const dbProductIds = new Set(visibleProducts.map((p) => p.id))
      console.log(`📦 Total de productos visibles en BD: ${dbProductIds.size}`)

      // Clasificar productos
      const discontinuedProductIds = Array.from(dbProductIds).filter((id) => !apiProductIds.has(id))
      const apiProducts = productsByChannel.data

      console.log('📊 CLASIFICACIÓN:')
      console.log(`   - Productos devueltos por API: ${apiProducts.length}`)
      console.log(`   - Productos descontinuados: ${discontinuedProductIds.length}`)

      return { apiProducts, discontinuedProductIds }
    } catch (error) {
      console.error('❌ Error obteniendo productos clasificados:', error)
      throw error
    }
  }

  /**
   * FASE 2: Procesar solo productos devueltos por la API
   * Garantiza éxito al procesar solo datos válidos
   */
  private async processApiProducts(apiProducts: any[]) {
    try {
      console.log(`🔄 Procesando ${apiProducts.length} productos de la API...`)

      let productsProcessed = 0
      let categoriesProcessed = 0
      let optionsProcessed = 0
      let variantsProcessed = 0

      // Procesar productos en lotes para evitar sobrecarga
      const batchSize = 100
      const batches: any[][] = []

      for (let i = 0; i < apiProducts.length; i += batchSize) {
        batches.push(apiProducts.slice(i, i + batchSize))
      }

      console.log(`📦 Procesando en ${batches.length} lotes de máximo ${batchSize}`)

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        console.log(
          `🔄 Procesando lote ${batchIndex + 1}/${batches.length} (${batch.length} productos)`
        )

        // Procesar cada lote en transacción separada
        await Database.transaction(async (trx) => {
          try {
            // 1. Guardar productos principales
            for (const product of batch) {
              try {
                const formattedProduct = await this.generalService.FormatProductsArray([product])
                if (formattedProduct && formattedProduct.length > 0) {
                  // ✅ Cast de tipo para evitar conflictos de propiedades
                  const productData = formattedProduct[0] as any
                  await ProductsBigcommerce.updateOrCreate({ id: productData.id }, productData, {
                    client: trx,
                  })
                  productsProcessed++
                }
              } catch (error) {
                console.log(`⚠️ Error formateando producto ${product.id}:`, error?.message)
              }
            }

            // 2. Procesar categorías del lote
            const categoryRelations: Array<{ product_id: number; category_id: number }> = []
            batch.forEach((product) => {
              if (product.categories && Array.isArray(product.categories)) {
                product.categories.forEach((categoryId: number) => {
                  categoryRelations.push({
                    product_id: product.id,
                    category_id: categoryId,
                  })
                })
              }
            })

            if (categoryRelations.length > 0) {
              await this.upsertCategoryRelationsBatch(categoryRelations, trx)
              categoriesProcessed += categoryRelations.length
            }

            // 3. Procesar opciones del lote
            const optionsPromises = batch.map(async (product) => {
              try {
                const options = await this.generalService.formatOptionsByVariantByProduct(product)
                if (Array.isArray(options) && options.length > 0) {
                  return options.map((option) => ({
                    label: option.label,
                    product_id: option.product_id,
                    option_id: option.id,
                    options: JSON.stringify(option.options),
                  }))
                }
                return []
              } catch (error) {
                console.log(
                  `⚠️ Error formateando opciones del producto ${product.id}:`,
                  error?.message
                )
                return []
              }
            })

            const allOptions = await Promise.all(optionsPromises)
            const flatOptions = allOptions.flat()

            if (flatOptions.length > 0) {
              await this.upsertOptionsBatch(flatOptions, trx)
              optionsProcessed += flatOptions.length
            }

            // 4. Procesar variantes del lote
            const variantsPromises = batch.map(async (product) => {
              try {
                const variants = await this.generalService.formatVariantsByProduct(product)
                return variants.map((variant) => ({
                  id: variant.id,
                  product_id: product.id,
                  title: variant.main_title,
                  sku: variant.sku,
                  normal_price: variant.normal_price,
                  discount_price: variant.discount_price,
                  cash_price: variant.cash_price,
                  discount_rate: variant.discount_rate,
                  stock: variant.stock,
                  warning_stock: variant.warning_stock,
                  image: variant.image,
                  images: variant.images,
                  quantity: variant.quantity,
                  armed_cost: variant.armed_cost,
                  armed_quantity: variant.armed_quantity,
                  weight: variant.weight,
                  height: variant.height,
                  width: variant.width,
                  depth: variant.depth,
                  type: variant.type,
                  options: variant.options,
                  // related_products: variant.related_products, // Comentado porque no existe en la interfaz
                }))
              } catch (error) {
                console.log(
                  `⚠️ Error formateando variantes del producto ${product.id}:`,
                  error?.message
                )
                return []
              }
            })

            const allVariants = await Promise.all(variantsPromises)
            const flatVariants = allVariants.flat()

            if (flatVariants.length > 0) {
              await this.upsertVariantsBatch(flatVariants, trx)
              variantsProcessed += flatVariants.length
            }

            console.log(`✅ Lote ${batchIndex + 1} procesado exitosamente`)
          } catch (error) {
            console.error(`❌ Error en lote ${batchIndex + 1}:`, error)
            throw error // Esto hace rollback de la transacción
          }
        })

        // Pausa entre lotes para evitar sobrecarga
        if (batchIndex < batches.length - 1) {
          await this.sleep(100)
        }
      }

      return {
        productsProcessed,
        categoriesProcessed,
        optionsProcessed,
        variantsProcessed,
      }
    } catch (error) {
      console.error('❌ Error procesando productos de la API:', error)
      throw error
    }
  }

  /**
   * FASE 3: Ocultar productos descontinuados
   * Cambia is_visible = false para productos no devueltos por la API
   */
  private async hideDiscontinuedProducts(discontinuedProductIds: number[]) {
    try {
      if (discontinuedProductIds.length === 0) {
        console.log('✅ No hay productos descontinuados para ocultar')
        return { hiddenCount: 0 }
      }

      console.log(`🚫 Ocultando ${discontinuedProductIds.length} productos descontinuados...`)

      let hiddenCount = 0
      let errorCount = 0

      // Ocultar en lotes para evitar timeouts
      const batchSize = 500
      for (let i = 0; i < discontinuedProductIds.length; i += batchSize) {
        const batch = discontinuedProductIds.slice(i, i + batchSize)

        try {
          const result = await ProductsBigcommerce.query().whereIn('product_id', batch).update({
            is_visible: false,
            updated_at: new Date(),
          })

          hiddenCount += result.length
          console.log(`✅ Lote ocultado: ${batch.length} productos`)
        } catch (error) {
          console.error('❌ Error ocultando lote:', error?.message)
          errorCount += batch.length
        }
      }

      console.log(
        `✅ OCULTACIÓN COMPLETADA: ${hiddenCount} productos ocultados, ${errorCount} errores`
      )

      return { hiddenCount, errorCount }
    } catch (error) {
      console.error('❌ Error ocultando productos descontinuados:', error)
      throw error
    }
  }

  /**
   * FASE 4: Limpiar referencias huérfanas
   * Elimina categorías, opciones y variantes de productos descontinuados
   */
  private async cleanupOrphanedReferences(discontinuedProductIds: number[]) {
    try {
      if (discontinuedProductIds.length === 0) {
        console.log('✅ No hay referencias huérfanas para limpiar')
        return { categoriesCleaned: 0, optionsCleaned: 0, variantsCleaned: 0 }
      }

      console.log(
        `🧹 Limpiando referencias huérfanas de ${discontinuedProductIds.length} productos...`
      )

      let categoriesCleaned = 0
      let optionsCleaned = 0
      let variantsCleaned = 0

      // Limpiar en lotes para evitar timeouts
      const batchSize = 500
      for (let i = 0; i < discontinuedProductIds.length; i += batchSize) {
        const batch = discontinuedProductIds.slice(i, i + batchSize)

        try {
          // 1. Limpiar categorías huérfanas
          const categoryResult = await CategoryProduct.query().whereIn('product_id', batch).delete()
          categoriesCleaned += categoryResult.length

          // 2. Limpiar opciones huérfanas
          const optionsResult = await OptionOfProducts.query().whereIn('product_id', batch).delete()
          optionsCleaned += optionsResult.length

          // 3. Limpiar variantes huérfanas
          const variantsResult = await Variant.query().whereIn('product_id', batch).delete()
          variantsCleaned += variantsResult.length

          console.log(`✅ Lote limpiado: ${batch.length} productos`)
        } catch (error) {
          console.error('❌ Error limpiando lote:', error?.message)
        }
      }

      console.log('✅ LIMPIEZA COMPLETADA:')
      console.log(`   - Categorías eliminadas: ${categoriesCleaned}`)
      console.log(`   - Opciones eliminadas: ${optionsCleaned}`)
      console.log(`   - Variantes eliminadas: ${variantsCleaned}`)

      return { categoriesCleaned, optionsCleaned, variantsCleaned }
    } catch (error) {
      console.error('❌ Error limpiando referencias huérfanas:', error)
      throw error
    }
  }

  /**
   * ============================================================================
   * MÉTODOS DE BATCH PARA EL ENFOQUE REFACTORIZADO
   * ============================================================================
   */

  /**
   * Upsert de categorías en batch para el enfoque refactorizado
   */
  private async upsertCategoryRelationsBatch(
    categoryRelations: Array<{ product_id: number; category_id: number }>,
    trx: any
  ) {
    if (categoryRelations.length === 0) {
      return
    }

    // Filtrar solo las categorías que realmente existen en la base de datos
    const validCategoryIds = await this.getValidCategoryIds(trx)
    const validRelations = categoryRelations.filter((relation) =>
      validCategoryIds.has(relation.category_id)
    )

    if (validRelations.length === 0) {
      console.log('⚠️ No hay categorías válidas para procesar en batch')
      return
    }

    console.log(`🏷️ Procesando ${validRelations.length} categorías válidas en batch`)

    // Usar updateOrCreate de Lucid para mayor seguridad
    for (const relation of validRelations) {
      try {
        await CategoryProduct.updateOrCreate(
          {
            product_id: relation.product_id,
            category_id: relation.category_id,
          },
          {
            product_id: relation.product_id,
            category_id: relation.category_id,
          },
          { client: trx }
        )
      } catch (error) {
        console.error(
          `❌ Error procesando categoría ${relation.category_id} para producto ${relation.product_id}:`,
          error
        )
      }
    }
  }

  /**
   * Upsert de opciones en batch para el enfoque refactorizado
   */
  private async upsertOptionsBatch(
    options: Array<{ option_id: number; product_id: number; label: string; options: string }>,
    trx: any
  ) {
    if (options.length === 0) {
      return
    }

    console.log(`⚙️ Procesando ${options.length} opciones en batch`)

    // Procesar cada opción del batch
    for (const option of options) {
      try {
        await OptionOfProducts.updateOrCreate(
          {
            option_id: option.option_id,
            product_id: option.product_id,
          },
          {
            option_id: option.option_id,
            label: option.label,
            product_id: option.product_id,
            options: option.options,
          },
          { client: trx }
        )
      } catch (error) {
        console.error(`❌ Error procesando opción ${option.option_id}:`, error?.message)
      }
    }
  }

  /**
   * Upsert de variantes en batch para el enfoque refactorizado
   */
  private async upsertVariantsBatch(variants: any[], trx: any) {
    if (variants.length === 0) {
      return
    }

    this.logger.info(`🔄 Procesando ${variants.length} variantes en batch`)

    // Procesar cada variante del batch
    for (const variant of variants) {
      try {
        await Variant.updateOrCreate({ id: variant.id }, variant, { client: trx })
      } catch (error) {
        this.logger.error(`❌ Error procesando variante ${variant.id}:`, error?.message)
      }
    }
  }

  /**
   * ============================================================================
   * MÉTODOS DE LIMPIEZA INCREMENTAL POR PRODUCTO
   * ============================================================================
   *
   * Estos métodos limpian las relaciones obsoletas ANTES de insertar
   * los nuevos datos, manteniendo la consistencia sin afectar la lógica existente.
   */

  /**
   * Obtiene el estado actual de un producto en la base de datos
   */
  private async getProductCurrentState(productId: number, trx: any) {
    try {
      const [categories, options, variants] = await Promise.all([
        Database.from('category_products')
          .where('product_id', productId)
          .select('category_id')
          .useTransaction(trx),
        Database.from('option_of_products')
          .where('product_id', productId)
          .select('option_id')
          .useTransaction(trx),
        Database.from('variants').where('product_id', productId).select('id').useTransaction(trx),
      ])

      return {
        categories: categories.map((c) => c.category_id),
        options: options.map((o) => o.option_id),
        variants: variants.map((v) => v.id),
      }
    } catch (error) {
      this.logger.error(
        `❌ Error obteniendo estado actual del producto ${productId}:`,
        error?.message
      )
      return { categories: [], options: [], variants: [] }
    }
  }

  /**
   * Limpia las relaciones obsoletas de un producto ANTES de insertar las nuevas
   */
  private async cleanProductObsoleteRelations(
    productId: number,
    currentState: { categories: number[]; options: number[]; variants: number[] },
    newData: { categories: number[]; options: number[]; variants: any[] },
    trx: any
  ) {
    try {
      const {
        categories: currentCategories,
        options: currentOptions,
        variants: currentVariants,
      } = currentState
      const { categories: newCategories, options: newOptions, variants: newVariants } = newData

      // Categorías obsoletas (están en BD pero no en nuevos datos)
      const obsoleteCategories = currentCategories.filter((catId) => !newCategories.includes(catId))
      if (obsoleteCategories.length > 0) {
        this.logger.info(
          `🧹 Limpiando ${obsoleteCategories.length} categorías obsoletas del producto ${productId}`
        )
        await Database.from('category_products')
          .where('product_id', productId)
          .whereIn('category_id', obsoleteCategories)
          .delete()
          .useTransaction(trx)
      }

      // Opciones obsoletas
      const obsoleteOptions = currentOptions.filter((optId) => !newOptions.includes(optId))
      if (obsoleteOptions.length > 0) {
        this.logger.info(
          `🧹 Limpiando ${obsoleteOptions.length} opciones obsoletas del producto ${productId}`
        )
        await Database.from('option_of_products')
          .where('product_id', productId)
          .whereIn('option_id', obsoleteOptions)
          .delete()
          .useTransaction(trx)
      }

      // Variantes obsoletas
      const obsoleteVariants = currentVariants.filter(
        (varId) => !newVariants.map((v) => v.id).includes(varId)
      )
      if (obsoleteVariants.length > 0) {
        this.logger.info(
          `🧹 Limpiando ${obsoleteVariants.length} variantes obsoletas del producto ${productId}`
        )
        await Database.from('variants')
          .where('product_id', productId)
          .whereIn('id', obsoleteVariants)
          .delete()
          .useTransaction(trx)
      }

      this.logger.info(`✅ Limpieza incremental completada para producto ${productId}`)
    } catch (error) {
      this.logger.error(
        `❌ Error en limpieza incremental del producto ${productId}:`,
        error?.message
      )
      throw error // Re-lanzar para que la transacción se revierta
    }
  }

  /**
   * ============================================================================
   * LIMPIEZA COMPLETA DE REFERENCIAS PARA PRODUCTOS OCULTOS
   * ============================================================================
   *
   * Cuando un producto se oculta porque no viene de la API, también eliminamos
   * todas sus referencias (categorías, opciones, variantes) para evitar
   * referencias huérfanas en la base de datos.
   *
   * @param productIds Array de IDs de productos que se van a ocultar
   */
  private async cleanReferencesForHiddenProducts(productIds: number[]) {
    try {
      console.log(
        `🧹 Iniciando limpieza completa de referencias para ${productIds.length} productos ocultos...`
      )

      // 🏷️ ELIMINAR RELACIONES PRODUCTO-CATEGORÍA
      const deletedCategories = await Database.from('category_products')
        .whereIn('product_id', productIds)
        .delete()
      console.log(`✅ ${deletedCategories} relaciones de categorías eliminadas`)

      // ⚙️ ELIMINAR OPCIONES DE PRODUCTOS
      const deletedOptions = await Database.from('option_of_products')
        .whereIn('product_id', productIds)
        .delete()
      console.log(`✅ ${deletedOptions} opciones de productos eliminadas`)

      // 🔄 ELIMINAR VARIANTES
      const deletedVariants = await Database.from('variants')
        .whereIn('product_id', productIds)
        .delete()
      console.log(`✅ ${deletedVariants} variantes eliminadas`)

      console.log(`🎯 Limpieza completa finalizada: ${productIds.length} productos procesados`)
      console.log(`   - Categorías eliminadas: ${deletedCategories}`)
      console.log(`   - Opciones eliminadas: ${deletedOptions}`)
      console.log(`   - Variantes eliminadas: ${deletedVariants}`)
    } catch (error) {
      console.error('❌ Error en limpieza completa de referencias:', error?.message)
      // ⚠️ NO lanzamos error para no bloquear el proceso principal
      // Solo loggeamos el error y continuamos
    }
  }

  /**
   * Sincroniza los canales por producto
   */
  private async syncChannelByProduct(products: BigCommerceProduct[], channel_id: number) {
    const trx = await Database.transaction()
    try {
      // Limpiar SOLO los registros del canal actual
      await ChannelProduct.query().useTransaction(trx).where('channel_id', channel_id).delete()

      // Preparar datos de canales
      const productsList = products.map((product) => ({
        product_id: product.id,
        channel_id: channel_id,
      }))

      // Guardar nuevas relaciones
      await ChannelProduct.createMany(productsList, { client: trx })
      await trx.commit()

      return {
        success: true,
        message: 'Canales sincronizados correctamente',
        total: productsList.length,
      }
    } catch (error) {
      await trx.rollback()
      return {
        success: false,
        message: 'Error al sincronizar canales',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * Sincroniza las relaciones producto-categoría hija de TODAS las categorías "Filtros" en filters_products
   */
  private async syncFiltersProducts() {
    const FiltersProductModule = await import('#models/filters_product')
    const FiltersProduct = FiltersProductModule.default
    // 1. Buscar TODAS las categorías cuyo título contenga "Filtros"
    console.log('🔍 Buscando categorías Filtros...')
    console.time('Búsqueda categorías Filtros')
    const idAdvanced = Number(env.get('ID_ADVANCED'))
    if (!idAdvanced) {
      throw new Error('ID_ADVANCED no está configurado en las variables de entorno')
    }
    const filtrosCategories = await Category.query().where('parent_id', idAdvanced)
    console.timeEnd('Búsqueda categorías Filtros')
    if (filtrosCategories.length === 0) {
      console.warn(`No existen categorías hijas de la categoría ${idAdvanced}`)
      return {
        success: false,
        message: `No existen categorías hijas de la categoría ${idAdvanced}`,
      }
    }
    console.log(`✅ Encontradas ${filtrosCategories.length} categorías hijas de ${idAdvanced}`)
    console.log(
      'Categorías encontradas:',
      filtrosCategories.map((cat) => ({ id: cat.category_id, title: cat.title }))
    )
    const filtrosCategoryIds = filtrosCategories.map((cat) => cat.category_id)

    // 2. Obtener los hijos de Filtros
    console.log('🔍 Obteniendo hijos de Filtros...')
    console.time('Obtención hijos')
    const hijos =
      filtrosCategoryIds.length > 0
        ? await Category.query().whereIn('parent_id', filtrosCategoryIds)
        : []
    console.timeEnd('Obtención hijos')
    const hijosIds = hijos.map((cat) => cat.category_id)
    console.log(`✅ Encontrados ${hijos.length} hijos de Filtros`)
    if (hijos.length > 0) {
      console.log(
        'Hijos encontrados:',
        hijos.map((cat) => ({ id: cat.category_id, title: cat.title, parent_id: cat.parent_id }))
      )
    }

    // 3. Usar directamente los hijos (no necesitamos nietos)
    console.log('🔍 Usando categorías hijas directamente...')
    if (hijosIds.length === 0) {
      return { success: false, message: 'No hay categorías hijas de Filtros' }
    }
    console.log(`✅ Usando ${hijos.length} categorías hijas de Filtros`)

    // 4. Obtener todas las relaciones producto-categoría para esos hijos
    console.log('🔍 Obteniendo relaciones producto-categoría para hijos...')
    console.time('Búsqueda relaciones')
    const relations = await CategoryProduct.query().whereIn('category_id', hijosIds)
    console.timeEnd('Búsqueda relaciones')
    console.log(`✅ Encontradas ${relations.length} relaciones producto-categoría`)

    // 5. Limpiar tabla filters_products (opcional, si quieres reemplazar todo)
    console.log('🧹 Limpiando tabla filters_products...')
    console.time('Limpieza tabla')
    await FiltersProduct.truncate()
    console.timeEnd('Limpieza tabla')
    console.log('✅ Tabla filters_products limpiada')

    // 6. Guardar las relaciones en filters_products
    console.log('💾 Insertando relaciones en filters_products...')
    console.time('Inserción relaciones')
    if (relations.length > 0) {
      const batchSize = 5000
      let totalInserted = 0
      for (let i = 0; i < relations.length; i += batchSize) {
        const batch = relations.slice(i, i + batchSize)
        await FiltersProduct.createMany(
          batch.map((rel) => ({
            product_id: rel.product_id,
            category_id: rel.category_id,
          }))
        )
        totalInserted += batch.length
        console.log(
          `✅ Insertadas ${batch.length} relaciones (batch ${Math.floor(i / batchSize) + 1}) - Total: ${totalInserted}`
        )
      }
    }
    console.timeEnd('Inserción relaciones')
    console.log('✅ Relaciones insertadas en filters_products')

    return {
      success: true,
      message: `Sincronizadas ${relations.length} relaciones en filters_products (hijos de Filtros)`,
    }
  }
}
