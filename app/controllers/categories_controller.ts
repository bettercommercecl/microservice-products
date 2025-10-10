import { HttpContext } from '@adonisjs/core/http'
import CategoryService from '#services/categories_service'

export default class CategoriesController {
  private categoryService: CategoryService

  constructor() {
    this.categoryService = new CategoryService()
  }

  /**
   * Obtiene todas las categorías
   */
  async index({ response }: HttpContext) {
    const categories = await this.categoryService.getAllCategories()

    // Respuesta estándar usando Adonis 6 nativo
    return response.ok({
      success: true,
      message: `Se encontraron ${categories.length} categorías`,
      data: categories,
      meta: {
        timestamp: new Date().toISOString(),
      },
    })
  }

  /**
   * Obtiene una categoría por ID
   */
  async show({ params, response }: HttpContext) {
    const categoryId = Number(params.id)

    // Validación que lanza error para que lo capture el handler
    if (!categoryId || Number.isNaN(categoryId) || categoryId <= 0) {
      throw new Error('ID de categoría debe ser un número positivo')
    }

    const category = await this.categoryService.getCategoryById(categoryId)

    // Respuesta estándar usando Adonis 6 nativo
    return response.ok({
      success: true,
      message: 'Categoría encontrada exitosamente',
      data: category,
      meta: {
        timestamp: new Date().toISOString(),
      },
    })
  }

  /**
   * Sincroniza las categorías desde BigCommerce
   */
  async sync({ response }: HttpContext) {
    const result = await this.categoryService.syncCategories()

    // Respuesta estándar de sincronización usando Adonis 6
    return response.ok({
      success: true,
      message: result.message,
      data: result.data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    })
  }
}
