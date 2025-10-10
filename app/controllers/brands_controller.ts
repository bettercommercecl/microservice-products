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
   * Obtiene todas las marcas
   */
  public async index({ response }: HttpContext) {
    try {
      const brands = await this.brandService.getAllBrands()

      return response.ok({
        success: true,
        data: brands,
        meta: {
          timestamp: new Date().toISOString(),
          total: brands.length,
        },
      })
    } catch (error) {
      this.logger.error('Error obteniendo marcas:', error)
      throw error
    }
  }

  /**
   * Obtiene una marca por ID
   */
  public async show({ params, response }: HttpContext) {
    const { id } = params

    try {
      const brand = await this.brandService.getBrandById(Number(id))

      return response.ok({
        success: true,
        data: brand,
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.logger.error(`Error obteniendo marca ${id}:`, error)
      throw error
    }
  }

  /**
   * Sincroniza las marcas desde BigCommerce
   */
  public async sync({ response }: HttpContext) {
    try {
      const result = await this.brandService.syncBrands()

      return response.ok({
        success: result.success,
        message: result.message,
        data: result.data,
        meta: {
          timestamp: new Date().toISOString(),
          ...result.meta,
        },
        errors: result.errors,
      })
    } catch (error) {
      this.logger.error('Error en sincronización de marcas:', error)
      throw error
    }
  }
}
