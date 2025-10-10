import { HttpContext } from '@adonisjs/core/http'
import VariantService from '#services/variant_service'
import vine from '@vinejs/vine'
import { variantsPaginatedSchema } from '../validators/variants_paginated_validator.js'
import { variantsByIdsSchema } from '../validators/variants_by_ids_validator.js'

export default class VariantController {
  private variantService: VariantService

  constructor() {
    this.variantService = new VariantService()
  }

  /**
   * Obtiene variantes paginadas
   */
  async index({ request, response }: HttpContext) {
    const validatedData = await vine.validate({
      schema: variantsPaginatedSchema,
      data: request.qs(),
    })

    const { page, limit, channel: channelId } = validatedData
    const variants = await this.variantService.getAllVariantsPaginated(page, limit, channelId)

    return response.ok(variants)
  }

  /**
   * Obtiene variantes formateadas por un grupo de IDs
   */
  async getFormattedByIds({ request, response }: HttpContext) {
    const validatedData = await vine.validate({
      schema: variantsByIdsSchema,
      data: request.body(),
    })

    const { ids } = validatedData
    const { data: variants } = await this.variantService.getVariantsByIds(ids)
    const onlyValidVariants = variants.filter(Boolean)
    const formatted = await this.variantService.formatVariants(onlyValidVariants)

    return response.ok(formatted)
  }
}
