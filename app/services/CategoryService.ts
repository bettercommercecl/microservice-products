import CategoryProduct from '#models/CategoryProduct'
import Category from '../models/Category.js'
import BigCommerceService from './BigCommerceService.js'

export default class CategoryService {
  private bigCommerceService: BigCommerceService

  constructor() {
    this.bigCommerceService = new BigCommerceService()
  }

  /**
   * Obtiene todas las categorías
   */
  async getAllCategories() {
    return await Category.all()
  }

  /**
   * Obtiene una categoría por ID
   */
  async getCategoryById(id: number) {
    return await Category.findOrFail(id)
  }

  /**
   * Sincroniza las categorías desde BigCommerce
   */
  async syncCategories() {
    try {
      const bigCommerceService = new BigCommerceService()
      const categories = await bigCommerceService.getCategories()

      // Procesar todas las categorías en paralelo
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

            return {
              error: false,
              message: 'Categoría sincronizada correctamente',
              data: category,
            }
          } catch (error) {
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

      return {
        success: failedCategories.length === 0,
        message:
          failedCategories.length > 0
            ? `Fallaron ${failedCategories.length} categorías en la sincronización`
            : 'Todas las categorías se sincronizaron correctamente',
        data: failedCategories,
      }
    } catch (error) {
      throw new Error(
        `Error al sincronizar categorías: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  //NUEVO 👀 👀
  static async getChildCategories(category_id: number): Promise<number[]> {
    try {
      let childCategoryIds = await Category.query()
        .where('parent_id', category_id)
        .select('category_id')
      // Tipar el parámetro category
      return childCategoryIds.map((category: { category_id: number }) => category.category_id)
    } catch (error) {
      console.error('Error al obtener categorias hijas:', error)
      return []
    }
  }

  //NUEVO 👀 👀
  static async getCampaignsByCategory(product: number, categories: number[]): Promise<string[]> {
    try {
      let productCategories = await CategoryProduct.query()
        .where('product_id', product)
        .whereIn('category_id', categories)
        .preload('category', (query) => {
          query.select(['title', 'url', 'category_id'])
        })
      // Tipar el parámetro item
      return productCategories.map((item: any) => item.category?.title).filter(Boolean)
    } catch (error) {
      console.error('Error al obtener campañas por categorías:', error)
      return []
    }
  }
}
