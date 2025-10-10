import Logger from '@adonisjs/core/services/logger'
import CategoryProduct from '#models/category_product'
import FiltersProduct from '#models/filters_product'
import env from '#start/env'
import pLimit from 'p-limit'

export default class FiltersService {
  private readonly logger = Logger.child({ service: 'FiltersService' })

  /**
   * Sincroniza las relaciones producto-categoría hija de TODAS las categorías "Filtros" en filters_products
   * Responsabilidad: Gestionar filtros de productos y sus categorías específicas
   */
  async syncFiltersProducts(trx?: any) {
    try {
      this.logger.info('Iniciando sincronización de filtros de productos...')
      const startTime = Date.now()

      const idAdvanced = Number(env.get('ID_ADVANCED'))
      if (!idAdvanced) {
        throw new Error('ID_ADVANCED no está configurado en las variables de entorno')
      }

      // OPTIMIZACIÓN EXTREMA: Una sola consulta SQL para todo
      this.logger.info('Ejecutando consulta optimizada para obtener relaciones...')

      // 🔥 Consulta SQL directa para obtener todas las relaciones en una sola operación
      const relations = await CategoryProduct.query()
        .join('categories as child', 'category_products.category_id', '=', 'child.category_id')
        .join('categories as parent', 'child.parent_id', '=', 'parent.category_id')
        .where('parent.parent_id', idAdvanced)
        .select('category_products.product_id', 'category_products.category_id')
        .distinct()

      this.logger.info(`Encontradas ${relations.length} relaciones producto-categoría`)

      if (relations.length === 0) {
        this.logger.warn('No se encontraron relaciones para sincronizar')
        return {
          success: true,
          message: 'No hay relaciones para sincronizar',
          data: { processed: 0 },
        }
      }

      // OPTIMIZACIÓN: Procesamiento en lotes paralelos optimizados
      const BATCH_SIZE = 1000 // Lotes optimizados para mejor rendimiento
      const batches = []

      // Crear lotes
      for (let i = 0; i < relations.length; i += BATCH_SIZE) {
        batches.push(relations.slice(i, i + BATCH_SIZE))
      }

      this.logger.info(`Procesando ${batches.length} lotes de filtros en paralelo...`)

      // Procesar lotes con límite de concurrencia reducido para mayor estabilidad
      const limitConcurrency = pLimit(3) // Máximo 3 lotes en paralelo para evitar timeouts
      const batchResults = await Promise.all(
        batches.map((batch, batchIndex) =>
          limitConcurrency(async () => {
            try {
              const dataToSave = batch.map((rel) => ({
                product_id: rel.product_id,
                category_id: rel.category_id,
              }))

              await FiltersProduct.updateOrCreateMany(['product_id', 'category_id'], dataToSave, {
                client: trx,
              })

              this.logger.info(`Lote ${batchIndex + 1}: ${batch.length} relaciones procesadas`)
              return { processed: batch.length, batch: batchIndex + 1 }
            } catch (error) {
              this.logger.error('Error en lote de filtros', {
                batch: batchIndex + 1,
                error: error.message,
                batch_size: batch.length,
                error_type: error.constructor.name,
              })
              // Re-lanzar el error para que la transacción haga rollback
              throw error
            }
          })
        )
      )

      // Consolidar resultados
      const totalProcessed = batchResults.reduce((sum, result) => sum + result.processed, 0)

      const totalTime = Date.now() - startTime

      this.logger.info(
        `Sincronización completada: ${totalProcessed} relaciones procesadas en ${totalTime}ms`
      )

      return {
        success: true,
        message: `${totalProcessed} relaciones sincronizadas`,
        data: {
          processed: totalProcessed,
          total_relations: relations.length,
          batches: batches.length,
        },
        meta: {
          performance: {
            total_time_ms: totalTime,
            relations_per_second:
              totalProcessed > 0 ? Math.round((totalProcessed / totalTime) * 1000) : 0,
          },
        },
      }
    } catch (error) {
      this.logger.error('Error al sincronizar filtros de productos', {
        error: error.message,
      })
      return {
        success: false,
        message: 'Error al sincronizar filtros de productos',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * Obtiene estadísticas de filtros
   */
  async getFiltersStats() {
    try {
      const totalFilters = await FiltersProduct.query().count('* as total')
      const filtersByCategory = await FiltersProduct.query()
        .select('category_id')
        .count('* as total')
        .groupBy('category_id')
        .orderBy('total', 'desc')
        .limit(10)

      return {
        success: true,
        data: {
          total_filters: Number(totalFilters[0].$extras.total),
          top_categories_with_filters: filtersByCategory.map((filter) => ({
            category_id: filter.category_id,
            products_count: Number(filter.$extras.total),
          })),
        },
      }
    } catch (error) {
      this.logger.error('Error al obtener estadísticas de filtros', {
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Obtiene filtros por producto
   */
  async getFiltersByProduct(productId: number) {
    try {
      const filters = await FiltersProduct.query()
        .where('product_id', productId)
        .preload('category', (query) => {
          query.select(['category_id', 'title', 'parent_id'])
        })

      return {
        success: true,
        data: filters,
        meta: {
          product_id: productId,
          total_filters: filters.length,
        },
      }
    } catch (error) {
      this.logger.error('Error al obtener filtros del producto', {
        product_id: productId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Obtiene productos por filtro (categoría)
   */
  async getProductsByFilter(categoryId: number) {
    try {
      const products = await FiltersProduct.query()
        .where('category_id', categoryId)
        .preload('product', (query) => {
          query.select(['id', 'name', 'is_visible'])
        })

      return {
        success: true,
        data: products,
        meta: {
          category_id: categoryId,
          total_products: products.length,
        },
      }
    } catch (error) {
      this.logger.error('Error al obtener productos del filtro', {
        category_id: categoryId,
        error: error.message,
      })
      throw error
    }
  }
}
