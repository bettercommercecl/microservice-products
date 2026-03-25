import Channel from '#models/channel'
import TableShapeService from '#services/table_shape_service'
import { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'
import { productsByChannelSchema } from '#validators/products_by_channel_validator'
import { productsPaginatedSchema } from '#validators/products_paginated_validator'

/**
 * Relación producto-categoría (category_products) en estructura de tabla para GET desde marcas y persistir.
 */
export default class CategoryProductsController {
  private tableShapeService = new TableShapeService()

  async indexPaginated({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: productsPaginatedSchema,
      data: request.qs(),
    })
    const page = validated.page ?? 1
    const limit = validated.limit ?? 50
    const { data, meta } = await this.tableShapeService.getCategoryProductsPaginated(page, limit)
    return response.ok({ success: true, data, meta })
  }

  async byChannel({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: productsByChannelSchema,
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
    const { data, meta } =
      await this.tableShapeService.getCategoryProductsByChannel(channelId, page, limit)
    return response.ok({ success: true, data, meta })
  }
}
