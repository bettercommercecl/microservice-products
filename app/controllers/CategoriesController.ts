import { HttpContext } from '@adonisjs/core/http'
import CategoryService from '../services/CategoryService.js'

export default class CategoriesController {
  private categoryService: CategoryService

  constructor() {
    this.categoryService = new CategoryService()
  }

  /**
   * Obtiene todas las categorías
   */
  async index({ response }: HttpContext) {
    try {
      const categories = await this.categoryService.getAllCategories()
      return response.ok(categories)
    } catch (error) {
      return response.internalServerError({
        error: 'Error',
        message: error instanceof Error ? error.message : 'Error al obtener las categorías'
      })
    }
  }

  /**
   * Obtiene una categoría por ID
   */
  async show({ params, response }: HttpContext) {
    try {
      const category = await this.categoryService.getCategoryById(params.id)
      return response.ok(category)
    } catch (error) {
      return response.notFound({
        error: 'Error',
        message: 'Categoría no encontrada'
      })
    }
  }

  /**
   * Sincroniza las categorías desde BigCommerce
   */
  async sync({ response }: HttpContext) {
    try {
      const result = await this.categoryService.syncCategories()
      
      // Siempre devolver 200 con los resultados
      return response.ok({
        message: result.message,
        data: result.data
      })
    } catch (error) {
      return response.internalServerError({
        error: 'Error',
        message: error instanceof Error ? error.message : 'Error al sincronizar categorías'
      })
    }
  }
} 