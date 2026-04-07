import { paginationConfig } from '#config/pagination'
import CatalogSafeStock from '#models/catalog_safe_stock'
import { normalizePaginationQs } from '#utils/pagination_query'
import { catalogSafeStocksPaginatedSchema } from '#validators/catalog_safe_stocks_paginated_validator'
import { HttpContext } from '@adonisjs/core/http'
import vine from '@vinejs/vine'

export default class CatalogSafeStocksController {
  /**
   * Lista registros de catalog_safe_stocks paginados
   * GET /api/catalog-safe-stocks?page=1&limit=1000
   */
  async indexPaginated({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: catalogSafeStocksPaginatedSchema,
      data: normalizePaginationQs(request.qs()),
    })

    const page = validated.page ?? paginationConfig.defaultPage
    const limit = validated.limit ?? 1000

    const paginated = await CatalogSafeStock.query()
      .select([
        'id',
        'sku',
        'product_id',
        'variant_id',
        'safety_stock',
        'warning_level',
        'available_to_sell',
        'bin_picking_number',
      ])
      .orderBy('id', 'asc')
      .paginate(page, limit)

    return response.ok({
      success: true,
      data: paginated.all(),
      meta: paginated.getMeta(),
    })
  }
}
