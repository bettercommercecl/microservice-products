import CategoryProduct from '#models/category_product'
import Category from '#models/category'
import BigCommerceService from '#services/bigcommerce_service'
import Logger from '@adonisjs/core/services/logger'
import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'

// ✅ INTERFACES PARA TIPADO FUERTE
interface BigCommerceProduct {
  id: number
  product_id: number
  categories: number[]
  name: string
  description: string
  brand_id: number
  price: number
  sale_price: number
  inventory_level: number
  quantity: number
  weight: number
  width: number
  depth: number
  height: number
  sort_order: number
  is_featured: boolean
  is_visible: boolean
  meta_keywords?: string[]
  meta_description?: string
  custom_url?: {
    url: string
  }
  images: Array<{
    is_thumbnail: boolean
    url_standard: string
    url_zoom: string
    description: string
    sort_order: number
  }>
  variants: Array<{
    id: number
    sku: string
    price: number
    sale_price: number | null
    calculated_price: number
    inventory_level: number
    calculated_weight: number
    width: number
    depth: number
    height: number
    image_url: string
    option_values: any[]
    value_id: number
  }>
}

export default class CategoryService {
  private readonly logger = Logger.child({ service: 'CategoryService' })

  /**
   * Obtiene todas las categorías
   */
  async getAllCategories() {
    this.logger.info('📂 Obteniendo todas las categorías de la base de datos...')
    const categories = await Category.all()
    this.logger.info(`✅ Categorías obtenidas exitosamente: ${categories.length} categorías`)
    return categories
  }

  /**
   * Obtiene una categoría por ID
   */
  async getCategoryById(id: number) {
    this.logger.info(`🔍 Obteniendo categoría por ID: ${id}`)
    const category = await Category.findOrFail(id)
    this.logger.info(`✅ Categoría obtenida exitosamente: ${category.title}`)
    return category
  }

  /**
   * Sincroniza las categorías desde BigCommerce
   */
  async syncCategories() {
    try {
      this.logger.info('🔄 Iniciando sincronización de categorías desde BigCommerce...')

      const bigCommerceService = new BigCommerceService()
      const categories = await bigCommerceService.getCategories()
      this.logger.info(`📊 Categorías obtenidas de BigCommerce: ${categories.length} categorías`)

      if (categories.length === 0) {
        this.logger.warn('⚠️ No se obtuvieron categorías de BigCommerce')
        return {
          success: true,
          message: 'No hay categorías para sincronizar',
          data: { faileds: [] },
        }
      }

      // 🚀 OPTIMIZACIÓN: Preparar datos para operación masiva
      this.logger.info('⚡ Preparando datos para sincronización masiva...')

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

      // 🚀 OPTIMIZACIÓN: Sincronización masiva usando updateOrCreateMany
      this.logger.info('🚀 Ejecutando sincronización masiva...')

      try {
        await Category.updateOrCreateMany(
          ['category_id'], // Clave única para identificar registros
          categoriesData
        )

        this.logger.info(
          `🎉 Sincronización masiva completada: ${categories.length} categorías procesadas`
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
        this.logger.error(
          '❌ Error en sincronización masiva, intentando sincronización individual...',
          massiveError
        )

        // 🚀 FALLBACK: Si falla la masiva, usar la estrategia individual como respaldo
        this.logger.info('🔄 Ejecutando sincronización individual como respaldo...')

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
              this.logger.info(
                `✅ Categoría sincronizada: ${categoryData.name} (ID: ${categoryData.category_id})`
              )

              return {
                error: false,
                message: 'Categoría sincronizada correctamente',
                data: category,
              }
            } catch (error) {
              this.logger.warn(`⚠️ Error al sincronizar categoría ${categoryData.name}:`, error)
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
          this.logger.warn(
            `⚠️ Fallaron ${failedCategories.length} categorías en la sincronización individual`
          )
        } else {
          this.logger.info(
            '🎉 Todas las categorías se sincronizaron correctamente (modo individual)'
          )
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
      this.logger.error('❌ Error general en sincronización de categorías:', error)
      throw new Error(
        `Error al sincronizar categorías: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  /**
   * 🔗 Sincroniza las relaciones producto-categoría
   * Responsabilidad: Gestionar asociaciones entre productos y categorías
   */
  async syncCategoriesByProduct(products: FormattedProductWithModelVariants[]) {
    try {
      this.logger.info(`🔄 Sincronizando categorías para ${products.length} productos...`)
      const startTime = Date.now()

      if (products.length === 0) {
        return { success: true, message: 'No hay productos para procesar', data: { processed: 0 } }
      }

      // 🚀 Formatear todas las relaciones de una vez
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
              `⚠️ Error parseando categories del producto ${product.product_id}:`,
              error
            )
            return []
          }
        })

      if (allRelations.length === 0) {
        this.logger.info('ℹ️ No se encontraron categorías válidas para procesar')
        return {
          success: true,
          message: 'No hay categorías válidas para procesar',
          data: { processed: 0 },
        }
      }

      this.logger.info(`📦 Formateadas ${allRelations.length} relaciones para guardar masivamente`)

      // 🚀 Procesar en lotes // Límite seguro para PostgreSQL
      const BATCH_SIZE = 1000
      const batches = []
      for (let i = 0; i < allRelations.length; i += BATCH_SIZE) {
        batches.push(allRelations.slice(i, i + BATCH_SIZE))
      }

      this.logger.info(
        `📦 Procesando ${batches.length} lotes de máximo ${BATCH_SIZE} relaciones cada uno`
      )

      // 🚀 Procesar lotes en paralelo
      const batchResults = await Promise.all(
        batches.map(async (batch, batchIndex) => {
          try {
            await CategoryProduct.updateOrCreateMany(['product_id', 'category_id'], batch)
            this.logger.info(`✅ Lote ${batchIndex + 1}: ${batch.length} relaciones guardadas`)
            return { processed: batch.length, batch: batchIndex + 1 }
          } catch (error) {
            this.logger.error(`❌ Error en lote ${batchIndex + 1}:`, error)
            return { processed: 0, batch: batchIndex + 1, error: error.message }
          }
        })
      )

      // 📊 Consolidar resultados
      const totalProcessed = batchResults.reduce((sum, result) => sum + result.processed, 0)
      const errors = batchResults.filter((result) => result.error)

      const totalTime = Date.now() - startTime

      this.logger.info(`✅ Sincronización completada: ${totalProcessed} relaciones guardadas`)

      if (errors.length > 0) {
        this.logger.warn(`⚠️ ${errors.length} lotes tuvieron errores`)
      }

      return {
        success: errors.length === 0,
        message:
          errors.length === 0
            ? `${totalProcessed} relaciones sincronizadas exitosamente`
            : `${totalProcessed} relaciones procesadas con ${errors.length} errores`,
        data: {
          processed: totalProcessed,
          total_products: products.length,
          batches: batches.length,
          errors: errors,
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
      this.logger.error('❌ Error sincronizando categorías por producto:', error)
      throw error
    }
  }

  /**
   * 📊 Obtiene estadísticas de categorías
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
      this.logger.error('❌ Error al obtener estadísticas de categorías:', error)
      throw error
    }
  }

  //NUEVO 👀 👀
  async getChildCategories(category_id: number): Promise<number[]> {
    const logger = Logger.child({ service: 'CategoryService' })
    try {
      logger.info(`👶 Obteniendo categorías hijas de la categoría ${category_id}...`)

      let childCategoryIds = await Category.query()
        .where('parent_id', category_id)
        .select('category_id')

      // Tipar el parámetro category
      const result = childCategoryIds.map(
        (category: { category_id: number }) => category.category_id
      )
      logger.info(`✅ Categorías hijas obtenidas: ${result.length} categorías`)
      return result
    } catch (error) {
      logger.error('❌ Error al obtener categorías hijas:', error)
      return []
    }
  }

  //NUEVO 👀 👀
  async getCampaignsByCategory(product: number, categories: number[]): Promise<string[]> {
    const logger = Logger.child({ service: 'CategoryService' })
    try {
      logger.info(
        `🎯 Obteniendo campañas para producto ${product} con ${categories.length} categorías...`
      )

      let productCategories = await CategoryProduct.query()
        .where('product_id', product)
        .whereIn('category_id', categories)
        .preload('category', (query) => {
          query.select(['title', 'url', 'category_id'])
        })

      // Tipar el parámetro item
      const result = productCategories.map((item: any) => item.category?.title).filter(Boolean)
      logger.info(`✅ Campañas obtenidas para producto ${product}: ${result.length} campañas`)
      return result
    } catch (error) {
      logger.error('❌ Error al obtener campañas por categorías:', error)
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
