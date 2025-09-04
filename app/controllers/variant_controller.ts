import { HttpContext } from '@adonisjs/core/http'
import VariantService from '#services/variant_service'
import Logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import { variantsPaginatedSchema } from '../validators/variants_paginated_validator.js'
import { variantsByIdsSchema } from '../validators/variants_by_ids_validator.js'

export default class VariantController {
  private variantService: VariantService
  private readonly logger = Logger.child({ service: 'VariantController' })

  constructor() {
    this.variantService = new VariantService()
  }

  /**
   * Obtiene variantes paginadas
   */
  async index({ request, response }: HttpContext) {
    // ✅ VALIDACIÓN CON VINEJS - Si falla, lanza error para el handler
    const validatedData = await vine.validate({
      schema: variantsPaginatedSchema,
      data: request.qs(),
    })

    const { page, limit, channel_id: channelId } = validatedData

    this.logger.info(
      `🔍 GET /variants - Obteniendo variantes paginadas: página ${page}, límite ${limit}${channelId ? `, canal ${channelId}` : ''}`
    )

    const variants = await this.variantService.getAllVariantsPaginated(page, limit, channelId)

    this.logger.info(`✅ Variantes obtenidas exitosamente: ${variants.data?.length || 0} variantes`)

    // ✅ Solo respuesta de éxito - errores van al handler global
    return response.ok(variants)
  }

  /**
   * Obtiene variantes formateadas por un grupo de IDs
   */
  async getFormattedByIds({ request, response }: HttpContext) {
    // ✅ VALIDACIÓN CON VINEJS - Si falla, lanza error para el handler
    const validatedData = await vine.validate({
      schema: variantsByIdsSchema,
      data: request.body(),
    })

    const { ids } = validatedData

    this.logger.info(
      `🔍 POST /variants/formatted - Obteniendo variantes formateadas para ${ids.length} IDs`
    )

    const { data: variants } = await this.variantService.getVariantsByIds(ids)
    const onlyValidVariants = variants.filter(Boolean)

    this.logger.info(`📊 Variantes válidas encontradas: ${onlyValidVariants.length}/${ids.length}`)

    const formatted = await this.variantService.formatVariants(onlyValidVariants)

    this.logger.info(`✅ Variantes formateadas exitosamente: ${formatted.length} variantes`)

    // ✅ Solo respuesta de éxito - errores van al handler global
    return response.ok(formatted)
  }
}
