import { paginationConfig } from '#config/pagination'
import Channel from '#models/channel'
import TableShapeService from '#services/table_shape_service'
import { normalizePaginationQs } from '#utils/pagination_query'
import { productsByChannelSchema } from '#validators/products_by_channel_validator'
import { productsPaginatedSchema } from '#validators/products_paginated_validator'
import { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

/**
 * Packs (products_packs) en estructura de tabla para GET desde marcas y persistir.
 */
export default class PacksController {
  private tableShapeService = new TableShapeService()

  async indexPaginated({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: productsPaginatedSchema,
      data: normalizePaginationQs(request.qs()),
    })
    const page = validated.page ?? paginationConfig.defaultPage
    const limit = validated.limit ?? paginationConfig.defaultLimit
    const { data, meta } = await this.tableShapeService.getPacksPaginated(page, limit)
    return response.ok({ success: true, data, meta })
  }

  async byChannel({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: productsByChannelSchema,
      data: normalizePaginationQs(request.qs()),
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
    const page = validated.page ?? paginationConfig.defaultPage
    const limit = validated.limit ?? paginationConfig.defaultLimit
    const { data, meta } = await this.tableShapeService.getPacksByChannel(channelId, page, limit)
    return response.ok({ success: true, data, meta })
  }
}
