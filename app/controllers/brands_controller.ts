import { HttpContext } from '@adonisjs/core/http'
import BrandService from '#services/brands_service'
import Logger from '@adonisjs/core/services/logger'

export default class BrandsController {
  private brandService: BrandService
  private readonly logger = Logger.child({ service: 'BrandsController' })

  constructor() {
    this.brandService = new BrandService()
  }

  /**
   * Sincroniza las marcas desde BigCommerce
   */
  public async sync({ response }: HttpContext) {
    this.logger.info('🔄 POST /brands/sync - Iniciando sincronización de marcas...')

    const result = await this.brandService.syncBrands()

    // Si hay errores en los resultados, lanzar error para que lo capture el handler
    if (!result.success) {
      this.logger.error('❌ Error en sincronización de marcas:', result.message)
      throw new Error(`Error en sincronización: ${result.message}`)
    }

    this.logger.info('✅ Sincronización de marcas completada exitosamente')

    // ✅ Respuesta estándar usando Adonis 6 nativo
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
