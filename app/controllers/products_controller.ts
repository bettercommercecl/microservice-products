import { HttpContext } from '@adonisjs/core/http'
import ProductService from '#services/product_service'
import Logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import { productsSyncSchema } from '../validators/products_sync_validator.js'
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
    this.logger.info('🔍 GET /products - Obteniendo todos los productos...')

    const products = await this.productService.getAllProducts()

    this.logger.info(`✅ Productos obtenidos exitosamente: ${products.data?.length || 0} productos`)

    // ✅ Respuesta estándar usando Adonis 6 nativo
    return response.ok({ products })
  }

  /**
   * Obtiene un producto por ID
   */
  async show({ params, response }: HttpContext) {
    // ✅ VALIDACIÓN CON VINEJS - Si falla, lanza error para el handler
    const validatedData = await vine.validate({
      schema: productShowSchema,
      data: params,
    })
    const { id: productId } = validatedData

    this.logger.info(`🔍 GET /products/${productId} - Obteniendo producto por ID...`)

    const product = await this.productService.getProductById(productId)

    if (!product || !product.data) {
      this.logger.warn(`⚠️ Producto no encontrado con ID: ${productId}`)
      throw new Error('Producto no encontrado')
    }

    this.logger.info(`✅ Producto obtenido exitosamente: ID ${productId}`)

    // ✅ Solo respuesta de éxito - errores van al handler global
    return response.ok({ product })
  }

  /**
   * Sincroniza los productos desde BigCommerce
   */
  async sync({ params, response }: HttpContext) {
    // ✅ VALIDACIÓN CON VINEJS - Si falla, lanza error para el handler
    const validatedData = await vine.validate({
      schema: productsSyncSchema,
      data: params,
    })
    const { channel_id: channelId } = validatedData

    this.logger.info(`🔄 POST /products/sync - Iniciando sincronización para canal ${channelId}...`)
    this.logger.info(`📊 Parámetros recibidos: { channel_id: ${channelId} }`)
    this.logger.info(`🏷️ Marca validada: channel_id ${channelId} corresponde a una marca válida`)

    const result = await this.productService.syncProducts(channelId)

    // ✅ LOGGING DEL RESULTADO
    if (result.success) {
      this.logger.info(`✅ Sincronización completada exitosamente para canal ${channelId}`)
      this.logger.info(`📊 Resultado: ${result.message}`)

      // Si hay errores en los resultados, lanzar error para el handler
      if (result.data && typeof result.data === 'object' && 'failed' in result.data) {
        const failedCount = Array.isArray(result.data.failed) ? result.data.failed.length : 0
        if (failedCount > 0) {
          this.logger.warn(`⚠️ Sincronización completada con ${failedCount} productos fallidos`)
          // Lanzar error para que el handler lo capture y devuelva respuesta estándar
          throw new Error(`Sincronización completada con ${failedCount} productos fallidos`)
        }
      }

      // ✅ Solo respuesta de éxito - errores van al handler global
      return response.ok({
        success: true,
        message: result.message,
        data: result.data,
        meta: {
          timestamp: new Date().toISOString(),
          channelId,
        },
      })
    } else {
      // ✅ Lanzar error para que el handler lo capture
      this.logger.error(`❌ Sincronización falló para canal ${channelId}: ${result.message}`)
      throw new Error(`Sincronización falló: ${result.message}`)
    }
  }
}
