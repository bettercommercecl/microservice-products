import Channel from '#models/channel'
import type Variant from '#models/variant'
import VariantService from '#services/variant_service'
import CategoryService from '#services/categories_service'
import ProductTagsCampaignsService from '#services/product_tags_campaigns_service'
import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import VariantRepository from '#infrastructure/persistence/repositories/variant_repository'
import GetVariantsPaginatedUseCase from '#application/use_cases/variants/get_variants_paginated_use_case'
import GetVariantsByChannelUseCase from '#application/use_cases/variants/get_variants_by_channel_use_case'
import VariantCatalogAdapter from '#infrastructure/adapters/variant_catalog_adapter'
import { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { variantsByIdsSchema } from '#validators/variants_by_ids_validator'
import { variantsByChannelSchema } from '#validators/variants_by_channel_validator'
import { variantsPaginatedListSchema } from '#validators/variants_paginated_list_validator'
import { variantsPaginatedSchema } from '#validators/variants_paginated_validator'

export default class VariantController {
  private readonly variantService: VariantService
  private readonly getVariantsPaginatedUseCase: GetVariantsPaginatedUseCase
  private readonly getVariantsByChannelUseCase: GetVariantsByChannelUseCase

  constructor() {
    this.variantService = new VariantService({
      productTagsCampaignsService: new ProductTagsCampaignsService({
        categoryService: new CategoryService(),
      }),
      calculation: new CalculationAdapter(),
      variantRepository: new VariantRepository(),
    })
    const variantCatalog = new VariantCatalogAdapter()
    this.getVariantsPaginatedUseCase = new GetVariantsPaginatedUseCase(variantCatalog)
    this.getVariantsByChannelUseCase = new GetVariantsByChannelUseCase(variantCatalog)
  }

  /**
   * Lista variantes paginadas: estructura de tabla, timestamps en ISO (para GET y guardar en marcas).
   * GET /api/variants/paginated?page=1&limit=50
   */
  async indexPaginated({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: variantsPaginatedListSchema,
      data: request.qs(),
    })
    const page = validated.page ?? 1
    const limit = validated.limit ?? 50
    const { data, meta } = await this.getVariantsPaginatedUseCase.execute(page, limit)
    return response.ok({ success: true, data, meta })
  }

  /**
   * Lista variantes por canal en formato marcas (id, sku, image, stock, main_title, precios, reserve, etc.).
   * Query: channel_id (number) o brand (string).
   * GET /api/variants/by-channel?channel_id=1 o ?brand=UF
   */
  async byChannel({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: variantsByChannelSchema,
      data: request.qs(),
    })
    const { channel_id: channelIdParam, brand } = validated
    if (channelIdParam === undefined && !brand) {
      return response.badRequest({
        success: false,
        message: 'Debe indicar channel_id (número) o brand (nombre del canal)',
      })
    }
    let channelId: number
    if (channelIdParam !== undefined) {
      channelId = channelIdParam
    } else {
      const channel = await Channel.query().where('name', brand!).first()
      if (!channel) {
        return response.notFound({
          success: false,
          message: `Canal no encontrado con nombre: ${brand}`,
        })
      }
      channelId = channel.id
    }
    const page = validated.page ?? 1
    const limit = validated.limit ?? 50
    const { data, meta } = await this.getVariantsByChannelUseCase.execute(channelId, page, limit)
    return response.ok({ success: true, data, meta })
  }

  /**
   * Obtiene variantes paginadas (legacy: acepta channel opcional).
   */
  async index({ request, response }: HttpContext) {
    const validatedData = await vine.validate({
      schema: variantsPaginatedSchema,
      data: request.qs(),
    })

    const page = validatedData.page ?? 1
    const limit = validatedData.limit ?? 100
    const channelId = validatedData.channel
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
    const onlyValidVariants = variants.filter(Boolean) as Variant[]
    const formatted = await this.variantService.formatVariants(onlyValidVariants)

    return response.ok(formatted)
  }
}
