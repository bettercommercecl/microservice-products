import CategoryProduct from '#models/category_product'
import Category from '../models/category.js'
import BigCommerceService from './bigcommerce_service.js'
import Logger from '@adonisjs/core/services/logger'

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

      // Procesar todas las categorías en paralelo
      this.logger.info('⚡ Procesando categorías en paralelo...')
      const results = await Promise.all(
        categories.map(async (categoryData) => {
          try {
            const searchPayload = {
              category_id: categoryData.category_id,
            }

            const url = categoryData.url ? categoryData.url.path : ''

            const persistancePayload = {
              category_id: categoryData.category_id,
              title: categoryData.name,
              url: url,
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
        this.logger.warn(`⚠️ Fallaron ${failedCategories.length} categorías en la sincronización`)
      } else {
        this.logger.info('🎉 Todas las categorías se sincronizaron correctamente')
      }

      return {
        success: failedCategories.length === 0,
        message:
          failedCategories.length > 0
            ? `Fallaron ${failedCategories.length} categorías en la sincronización`
            : 'Todas las categorías se sincronizaron correctamente',
        data: { faileds: failedCategories },
      }
    } catch (error) {
      this.logger.error('❌ Error general en sincronización de categorías:', error)
      throw new Error(
        `Error al sincronizar categorías: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  //NUEVO 👀 👀
  static async getChildCategories(category_id: number): Promise<number[]> {
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
  static async getCampaignsByCategory(product: number, categories: number[]): Promise<string[]> {
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
}
