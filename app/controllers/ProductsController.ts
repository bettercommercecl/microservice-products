import { HttpContext } from '@adonisjs/core/http'
import ProductService from '../services/ProductService.js'

export default class ProductsController {
  private productService: ProductService

  constructor() {
    this.productService = new ProductService()
  }

  /**
   * Obtiene todos los productos
   */
  async index({ response }: HttpContext) {
    try {
      const products = await this.productService.getAllProducts()

      return response.ok(products)
    } catch (error) {
      return response.internalServerError({
        error: 'Error',
        message: error instanceof Error ? error.message : 'Error al obtener los productos'
      })
    }
  }

  /**
   * Obtiene un producto por ID
   */
  async show({ params, response }: HttpContext) {
    try {
      const product = await this.productService.getProductById(params.id)
      return response.ok(product)
    } catch (error) {
      return response.notFound({
        error: 'Error',
        message: 'Producto no encontrado'
      })
    }
  }

  /**
   * Sincroniza los productos desde BigCommerce
   */
  async sync({ params, response }: HttpContext) {
    try {
      const result = await this.productService.syncProducts(params.channel_id)
      
      // Si hay errores en los resultados, devolver un 400 con los detalles
      if (!result.success) {
        return response.badRequest({
          error: 'Error',
          message: result.message,
          data: result.data
        })
      }

      // Si todo salió bien, devolver un 200 con los resultados
      return response.ok({
        message: result.message,
        data: result.data
      })
    } catch (error) {
      return response.internalServerError({
        error: 'Error',
        message: error instanceof Error ? error.message : 'Error al sincronizar productos'
      })
    }
  }
} 