import { HttpContext } from '@adonisjs/core/http'
import CategoryService from '#services/category_service'
import Logger from '@adonisjs/core/services/logger'

export default class CategoriesController {
  private categoryService: CategoryService
  private readonly logger = Logger.child({ service: 'CategoriesController' })

  constructor() {
    this.categoryService = new CategoryService()
  }

  /**
   * Obtiene todas las categorías
   */
  async index({ response }: HttpContext) {
    this.logger.info('🔍 GET /categories - Obteniendo todas las categorías...')

    const categories = await this.categoryService.getAllCategories()

    this.logger.info(`✅ Categorías obtenidas exitosamente: ${categories.length} categorías`)

    // ✅ Respuesta estándar usando Adonis 6 nativo
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

    // ✅ Validación que lanza error para que lo capture el handler
    if (!categoryId || Number.isNaN(categoryId) || categoryId <= 0) {
      this.logger.warn(`⚠️ ID de categoría inválido recibido: ${params.id}`)
      throw new Error('ID de categoría debe ser un número positivo')
    }

    this.logger.info(`🔍 GET /categories/${categoryId} - Obteniendo categoría por ID...`)

    const category = await this.categoryService.getCategoryById(categoryId)

    this.logger.info(`✅ Categoría obtenida exitosamente: ID ${categoryId}`)

    // ✅ Respuesta estándar usando Adonis 6 nativo
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
    this.logger.info('🔄 POST /categories/sync - Iniciando sincronización de categorías...')

    const result = await this.categoryService.syncCategories()

    // 📊 Calcular estadísticas de sincronización
    const totalCategories = Array.isArray(result.data) ? result.data.length : 0
    const failedCategories = Array.isArray(result.data)
      ? result.data.filter((item: any) => item.error).length
      : 0
    const successCategories = totalCategories - failedCategories

    this.logger.info(
      `✅ Sincronización de categorías completada: ${successCategories} exitosas, ${failedCategories} fallidas`
    )

    // 🎯 Respuesta estándar de sincronización usando Adonis 6
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
