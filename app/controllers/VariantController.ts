import { HttpContext } from '@adonisjs/core/http'
import VariantService from '../services/VariantService.js'
import Product from '#models/Product'
import Variant from '#models/Variant'

export default class VariantController {
  private variantService: VariantService

  constructor() {
    this.variantService = new VariantService()
  }

  /**
   * Obtiene todos los productos
   */
  async index({ response }: HttpContext) {
    try {
      const variants = await this.variantService.getAllVariants()
      const formattedProducts = await this.variantService.formatVariants(variants.data)

      return response.ok(formattedProducts)
    } catch (error) {
      return response.internalServerError({
        error: 'Error',
        message: error instanceof Error ? error.message : 'Error al obtener los productos'
      })
    }
  }
} 