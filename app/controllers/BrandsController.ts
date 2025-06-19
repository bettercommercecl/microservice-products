import { HttpContext } from '@adonisjs/core/http'
import BrandService from '../services/BrandService.js'

export default class BrandsController {
  private brandService: BrandService

  constructor() {
    this.brandService = new BrandService()
  }

  /**
   * Sincroniza las marcas desde BigCommerce
   */
  public async sync({ response }: HttpContext) {
    try {
      const result = await this.brandService.syncBrands()
      
      // Si hay errores en los resultados, devolver 500
      if (!result.success) {
        return response.status(500).json({
          status: 500,
          error: 'DatabaseError',
          message: result.message,
          data: result.data
        })
      }

      return response.json(result)
    } catch (error) {
      // Si es un error de base de datos, devolver 500
      if (error instanceof Error && error.message.includes('column')) {
        return response.status(500).json({
          status: 500,
          error: 'DatabaseError',
          message: 'Error en la base de datos: ' + error.message,
          stack: error.stack
        })
      }

      return response.status(400).json({
        status: 400,
        error: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : 'Error desconocido',
        stack: error instanceof Error ? error.stack : undefined
      })
    }
  }
} 