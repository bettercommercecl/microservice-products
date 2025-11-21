import { HttpContext } from '@adonisjs/core/http'
import ProductService from '#services/product_service'
import Logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import { productShowSchema } from '../validators/product_show_validator.js'

export default class ProductsController {
  private productService: ProductService
  private readonly logger = Logger.child({ service: 'ProductsController' })

  constructor() {
    this.productService = new ProductService()
  }

  /**
   * Obtiene todos los productos
   */
  async index({ response }: HttpContext) {
    const products = await this.productService.getAllProducts()

    // Respuesta estándar usando Adonis 6 nativo
    return response.ok(products)
  }

  /**
   * Obtiene un producto por ID
   */
  async show({ params, response }: HttpContext) {
    // VALIDACIÓN CON VINEJS - Si falla, lanza error para el handler
    const validatedData = await vine.validate({
      schema: productShowSchema,
      data: params,
    })
    const { id: productId } = validatedData

    const product = await this.productService.getProductById(productId)

    if (!product || !product.data) {
      this.logger.error(`Producto no encontrado con ID: ${productId}`)
      throw new Error('Producto no encontrado')
    }

    // Solo respuesta de éxito - errores van al handler global
    return response.ok(product)
  }

  /**
   * Obtener estadísticas de sincronización de un canal
   */
  async getSyncStats({ params, response }: HttpContext) {
    const { channel_id: channelId } = params

    try {
      // TODO: Implementar getSyncStats cuando sea necesario
      const stats = { message: 'Estadísticas no implementadas aún' }

      return response.ok({
        success: true,
        message: 'Estadísticas de sincronización obtenidas exitosamente',
        data: {
          channelId: Number(channelId),
          stats,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.logger.error(`Error obteniendo estadísticas de sincronización:`, error)
      throw error
    }
  }
}
