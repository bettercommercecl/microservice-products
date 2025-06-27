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
  async index({ request, response }: HttpContext) {
    try {
      // Paginación por defecto: 200 por página
      const page = Number(request.input('page', 1))
      const limit = Number(request.input('limit', 200))
      const channel = request.input('channel')
      const channelId = channel ? Number(channel) : undefined
      const variants = await this.variantService.getAllVariantsPaginated(page, limit, channelId)
      return response.ok(variants)
    } catch (error) {
      return response.internalServerError({
        error: 'Error',
        message: error instanceof Error ? error.message : 'Error al obtener los productos'
      })
    }
  }

  /**
   * Obtiene variantes formateadas por un grupo de IDs
   */
  async getFormattedByIds({ request, response }: HttpContext) {
    try {
      // Supón que recibes los IDs por query o body
      const ids = request.input('ids') // o request.body().ids
      if (!Array.isArray(ids) || ids.length === 0) {
        return response.badRequest({ error: 'Debes enviar un array de IDs' })
      }

      const { data: variants } = await this.variantService.getVariantsByIds(ids)
      const formatted = await this.variantService.formatVariants(variants)
      return response.ok(formatted)
    } catch (error) {
      return response.internalServerError({
        error: 'Error',
        message: error instanceof Error ? error.message : 'Error al obtener variantes por IDs',
      })
    }
  }
} 