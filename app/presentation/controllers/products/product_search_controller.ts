import Variant from '#models/variant'
import { HttpContext } from '@adonisjs/core/http'

export default class ProductSearchController {
  /**
   * Búsqueda de variantes por texto libre.
   * Busca en sku, variant.title y product.title (ILIKE).
   * GET /api/products/search?q=&channel_id=&limit=
   */
  async search({ request, response }: HttpContext) {
    const q = String(request.input('q', '')).trim()
    const channelId = request.input('channel_id')
    const limit = Math.min(Number(request.input('limit', 20)), 50)

    if (!q || q.length < 2) {
      return response.ok({ success: true, data: [] })
    }

    const pattern = `%${q}%`

    let query = Variant.query()
      .preload('product')
      .preload('stockData')
      .where((builder) => {
        void builder
          .whereILike('variants.sku', pattern)
          .orWhereILike('variants.title', pattern)
          .orWhereHas('product', (productBuilder) => {
            void productBuilder.whereILike('title', pattern)
          })
      })
      .where('variants.is_visible', true)
      .limit(limit)

    if (channelId) {
      query = query.whereHas('product', (productBuilder) => {
        void productBuilder.whereHas('channelProducts', (cpBuilder) => {
          void cpBuilder.where('channel_id', Number(channelId))
        })
      })
    }

    const variants = await query

    const data = variants.map((v) => {
      const isReserve = !!v.stockData?.bin_picking_number
      return {
        variant_id: v.id,
        product_id: v.product_id,
        sku: v.sku,
        name: v.product?.title ?? v.title,
        variant_name: v.title,
        price: v.discount_price || v.normal_price || 0,
        normal_price: v.normal_price || 0,
        discount_price: v.discount_price || null,
        stock: v.stock ?? 0,
        image: v.image ?? v.product?.image ?? null,
        product_image: v.product?.image ?? null,
        is_reserve: isReserve,
        bin_picking_number: v.stockData?.bin_picking_number ?? null,
      }
    })

    return response.ok({ success: true, data })
  }
}
