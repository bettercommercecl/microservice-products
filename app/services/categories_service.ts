import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'
import Category from '#models/category'
import CategoryProduct from '#models/category_product'
import Logger from '@adonisjs/core/services/logger'
import pLimit from 'p-limit'

export default class CategoryService {
  private readonly logger = Logger.child({ service: 'CategoryService' })

  /**
   * Obtiene todas las categorías
   */
  async getAllCategories() {
    const categories = await Category.all()
    return categories
  }

  /**
   * Obtiene una categoría por ID
   */
  async getCategoryById(id: number) {
    const category = await Category.findOrFail(id)
    return category
  }

  /**
   * Sincroniza las categorías desde BigCommerce
   */
  async syncCategories() {
    try {
      const bigCommerceService = new BigCommerceService()
      const categories = await bigCommerceService.getCategories()

      if (categories.length === 0) {
        return {
          success: true,
          message: 'No hay categorías para sincronizar',
          data: { faileds: [] },
        }
      }

      // OPTIMIZACIÓN: Preparar datos para operación masiva
      const categoriesData = categories.map((categoryData) => ({
        category_id: categoryData.category_id,
        title: categoryData.name,
        url: categoryData.url ? categoryData.url.path : '',
        parent_id: categoryData.parent_id,
        order: categoryData.sort_order,
        image: categoryData.image_url,
        is_visible: categoryData.is_visible,
        tree_id: categoryData.tree_id || null,
      }))

      // OPTIMIZACIÓN: Sincronización masiva usando updateOrCreateMany
      try {
        await Category.updateOrCreateMany(
          ['category_id'], // Clave única para identificar registros
          categoriesData
        )

        return {
          success: true,
          message: `Todas las ${categories.length} categorías se sincronizaron correctamente`,
          data: {
            total: categories.length,
            faileds: [],
            message: 'Sincronización masiva exitosa',
          },
        }
      } catch (massiveError) {
        this.logger.warn('Error en sincronización masiva, usando método individual', {
          error: massiveError.message,
        })

        // FALLBACK: Si falla la masiva, usar la estrategia individual como respaldo
        const results = await Promise.all(
          categories.map(async (categoryData) => {
            try {
              const searchPayload = { category_id: categoryData.category_id }
              const persistancePayload = {
                category_id: categoryData.category_id,
                title: categoryData.name,
                url: categoryData.url ? categoryData.url.path : '',
                parent_id: categoryData.parent_id,
                order: categoryData.sort_order,
                image: categoryData.image_url,
                is_visible: categoryData.is_visible,
                tree_id: categoryData.tree_id || null,
              }

              const category = await Category.updateOrCreate(searchPayload, persistancePayload)

              return {
                error: false,
                message: 'Categoría sincronizada correctamente',
                data: category,
              }
            } catch (error) {
              this.logger.warn('Error al sincronizar categoría', {
                category_name: categoryData.name,
                category_id: categoryData.category_id,
                error: error.message,
              })
              return {
                error: true,
                message: `Error al sincronizar categoría ${categoryData.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`,
                data: categoryData,
              }
            }
          })
        )

        // Filtrar solo las categorías que fallaron
        const failedCategories = results.filter((result) => result.error)

        if (failedCategories.length > 0) {
          this.logger.warn('Fallaron categorías en sincronización individual', {
            failed_count: failedCategories.length,
            total_categories: categories.length,
          })
        }

        return {
          success: failedCategories.length === 0,
          message:
            failedCategories.length > 0
              ? `Fallaron ${failedCategories.length} categorías en la sincronización individual`
              : 'Todas las categorías se sincronizaron correctamente (modo individual)',
          data: {
            total: categories.length,
            faileds: failedCategories,
            mode: 'individual_fallback',
          },
        }
      }
    } catch (error) {
      this.logger.error('Error general en sincronización de categorías', {
        error: error.message,
      })
      throw new Error(
        `Error al sincronizar categorías: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  /**
   * Sincroniza las relaciones producto-categoría
   * Responsabilidad: Gestionar asociaciones entre productos y categorías
   */
  async syncCategoriesByProduct(products: FormattedProductWithModelVariants[], trx?: any) {
    try {
      this.logger.info(`Sincronizando categorías para ${products.length} productos...`)
      const startTime = Date.now()

      if (products.length === 0) {
        return { success: true, message: 'No hay productos para procesar', data: { processed: 0 } }
      }

      // Formatear todas las relaciones de una vez
      const allRelations = products
        .filter((product) => product.categories && product.categories.trim() !== '')
        .flatMap((product) => {
          try {
            const categoryIds = JSON.parse(product.categories) as number[]
            return categoryIds
              .filter((id) => typeof id === 'number' && id > 0)
              .map((categoryId) => ({
                product_id: product.product_id,
                category_id: categoryId,
              }))
          } catch (error) {
            this.logger.warn(
              `Error parseando categories del producto ${product.product_id}:`,
              error
            )
            return []
          }
        })

      if (allRelations.length === 0) {
        this.logger.info('No se encontraron categorías válidas para procesar')
        return {
          success: true,
          message: 'No hay categorías válidas para procesar',
          data: { processed: 0 },
        }
      }

      this.logger.info(`Formateadas ${allRelations.length} relaciones para guardar masivamente`)

      // Filtrar solo relaciones cuya categoría exista en BD (evitar violación de FK)
      const uniqueCategoryIds = [...new Set(allRelations.map((r) => r.category_id))]
      const existingCategories = await Category.query()
        .whereIn('category_id', uniqueCategoryIds)
        .select('category_id')
      const existingCategoryIdSet = new Set(existingCategories.map((c) => c.category_id))
      const validRelations = allRelations.filter((r) => existingCategoryIdSet.has(r.category_id))
      const skippedCount = allRelations.length - validRelations.length
      if (skippedCount > 0) {
        const skippedIds = uniqueCategoryIds.filter((id) => !existingCategoryIdSet.has(id))
        this.logger.warn(
          {
            skipped_relations: skippedCount,
            missing_category_ids: skippedIds.slice(0, 20),
            total_missing_categories: skippedIds.length,
          },
          'Relaciones omitidas: category_id no existe en tabla categories (sincronizar categorías antes o revisar datos en origen)'
        )
      }

      if (validRelations.length === 0) {
        this.logger.info('No quedan relaciones válidas tras filtrar por categorías existentes')
        return {
          success: true,
          message: 'No hay relaciones con categorías existentes para guardar',
          data: { processed: 0, skipped: skippedCount },
        }
      }

      // Procesar en lotes // Límite seguro para PostgreSQL
      const BATCH_SIZE = 1000
      const batches = []
      for (let i = 0; i < validRelations.length; i += BATCH_SIZE) {
        batches.push(validRelations.slice(i, i + BATCH_SIZE))
      }

      this.logger.info(
        `Procesando ${batches.length} lotes de máximo ${BATCH_SIZE} relaciones cada uno`
      )

      // Procesar lotes con límite de concurrencia reducido para mayor estabilidad
      const limitConcurrency = pLimit(3) // Máximo 3 lotes en paralelo para evitar timeouts
      const batchResults = await Promise.all(
        batches.map((batch, batchIndex) =>
          limitConcurrency(async () => {
            try {
              await CategoryProduct.updateOrCreateMany(['product_id', 'category_id'], batch, {
                client: trx,
              })
              this.logger.info(`Lote ${batchIndex + 1}: ${batch.length} relaciones guardadas`)
              return { processed: batch.length, batch: batchIndex + 1 }
            } catch (error) {
              this.logger.error(`Error en lote ${batchIndex + 1}:`, {
                error: error.message,
                batch_size: batch.length,
                batch_index: batchIndex + 1,
                error_type: error.constructor.name,
              })
              // Re-lanzar el error para que la transacción haga rollback
              throw error
            }
          })
        )
      )

      // Consolidar resultados
      const totalProcessed = batchResults.reduce(
        (sum: number, result: any) => sum + result.processed,
        0
      )
      const errors = batchResults.filter((result: any) => result.error)

      const totalTime = Date.now() - startTime

      this.logger.info(`Sincronización completada: ${totalProcessed} relaciones guardadas`)

      if (errors.length > 0) {
        this.logger.warn(`${errors.length} lotes tuvieron errores`)
      }

      return {
        success: errors.length === 0,
        message:
          errors.length === 0
            ? `${totalProcessed} relaciones sincronizadas`
            : `${totalProcessed} relaciones procesadas con ${errors.length} errores`,
        data: {
          processed: totalProcessed,
          total_products: products.length,
          batches: batches.length,
          errors: errors,
          ...(skippedCount > 0 && { skipped_invalid_category: skippedCount }),
        },
        meta: {
          performance: {
            relations_per_second:
              totalProcessed > 0 ? Math.round((totalProcessed / totalTime) * 1000) : 0,
            total_processed: totalProcessed,
            total_batches: batches.length,
            total_time_ms: totalTime,
            error_rate: errors.length > 0 ? (errors.length / batches.length) * 100 : 0,
            products_with_categories: products.filter(
              (p) => p.categories && p.categories.trim() !== ''
            ).length,
          },
        },
      }
    } catch (error) {
      this.logger.error('Error sincronizando categorías por producto:', error)
      throw error
    }
  }
  /**
   * Obtiene estadísticas de categorías
   */
  async getCategoriesStats() {
    try {
      const totalCategories = await Category.query().count('* as total')
      const totalRelations = await CategoryProduct.query().count('* as total')
      const categoriesWithProducts = await CategoryProduct.query()
        .select('category_id')
        .count('* as total')
        .groupBy('category_id')
        .orderBy('total', 'desc')
        .limit(10)

      return {
        success: true,
        data: {
          total_categories: Number(totalCategories[0].$extras.total),
          total_product_category_relations: Number(totalRelations[0].$extras.total),
          top_categories_with_products: categoriesWithProducts.map((cat) => ({
            category_id: cat.category_id,
            products_count: Number(cat.$extras.total),
          })),
        },
      }
    } catch (error) {
      this.logger.error('Error al obtener estadísticas de categorías', {
        error: error.message,
      })
      throw error
    }
  }

  //NUEVO 👀 👀
  async getChildCategories(category_id: number): Promise<number[]> {
    try {
      let childCategoryIds = await Category.query()
        .where('parent_id', category_id)
        .select('category_id')

      // Tipar el parámetro category
      const result = childCategoryIds.map(
        (category: { category_id: number }) => category.category_id
      )
      return result
    } catch (error) {
      this.logger.error('Error al obtener categorías hijas', {
        category_id,
        error: error.message,
      })
      return []
    }
  }

  //NUEVO 👀 👀
  async getCampaignsByCategory(product: number, categories: number[]): Promise<string[]> {
    try {
      let productCategories = await CategoryProduct.query()
        .where('product_id', product)
        .whereIn('category_id', categories)
        .preload('category', (query) => {
          query.select(['title', 'url', 'category_id'])
        })

      // Tipar el parámetro item
      const result = productCategories.map((item: any) => item.category?.title).filter(Boolean)
      return result
    } catch (error) {
      this.logger.error('Error al obtener campañas por categorías', {
        product_id: product,
        categories_count: categories.length,
        error: error.message,
      })
      return []
    }
  }
  async getDateReserve(reserveId: number) {
    const childsCategories = await Category.query()
      .select('category_id', 'title')
      .where('parent_id', reserveId)
      .pojo()

    return childsCategories
  }
}
