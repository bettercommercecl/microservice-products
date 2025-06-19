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
      const failedCategories = results.filter(result => result.error)

      return {
        success: failedCategories.length === 0,
        message: failedCategories.length > 0 
          ? `Fallaron ${failedCategories.length} categorías en la sincronización` 
          : 'Todas las categorías se sincronizaron correctamente',
        data: failedCategories,
      }
    } catch (error) {
      throw new Error(`Error al sincronizar categorías: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }
} 