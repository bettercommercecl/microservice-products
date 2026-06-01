import { paginationConfig } from '#config/pagination'
import CatalogSafeStock from '#models/catalog_safe_stock'
import ProductPack from '#models/product_pack'
import Variant from '#models/variant'
import env from '#start/env'
import { normalizePaginationQs } from '#utils/pagination_query'
import { catalogSafeStocksBySkusSchema } from '#validators/catalog_safe_stocks_by_skus_validator'
import { catalogSafeStocksPaginatedSchema } from '#validators/catalog_safe_stocks_paginated_validator'
import { HttpContext } from '@adonisjs/core/http'
import Database from '@adonisjs/lucid/services/db'
import vine from '@vinejs/vine'

interface SkuStockItem {
  sku: string
  title: string
  stock: number
  available: boolean
  discount_price: number | null
  image: string | null
  is_reserve: boolean
  bin_picking_number: string | null
  date_reserve: string | null
  is_pack: boolean
  pack_items: PackItem[]
}

interface PackItem {
  sku: string
  title: string
  /** Unidades de esta variante/SKU por cada unidad vendida del pack (1 pack = N del ítem). */
  quantity: number
  stock: number
  available: boolean
  discount_price: number | null
  image: string | null
  is_reserve: boolean
  bin_picking_number: string | null
  date_reserve: string | null
}

export default class CatalogSafeStocksController {
  async bySkus({ request, response }: HttpContext) {
    const validated = await catalogSafeStocksBySkusSchema.validate(request.body())

    const variants = await Variant.query()
      .whereIn('sku', validated.skus)
      .preload('stockData')
      .preload('product')

    if (!variants.length) {
      return response.ok({ success: true, data: [] })
    }

    const packsCategory = env.get('ID_PACKS')
    const productIds = [...new Set(variants.map((v) => v.product_id))]

    // Determina qué product_ids pertenecen a la categoría de packs
    const packRows = packsCategory
      ? await Database.from('category_products')
          .whereIn('product_id', productIds)
          .where('category_id', packsCategory)
          .select('product_id')
      : []

    const packProductIds = new Set(
      packRows.map((r: { product_id: number }) => Number(r.product_id))
    )

    /**
     * Líneas del pack asociadas a la variante vendida (SKU del payload).
     * products_packs.pack_variant_id = variants.id del pack en BC; debe coincidir con la variante consultada.
     * Si no hay filas para ese par (sync antiguo), se usan solo líneas con pack_variant_id NULL para ese pack_id.
     */
    const packItemsByVariantId = new Map<number, PackItem[]>()
    if (packProductIds.size > 0) {
      const packVariantIds = variants
        .filter((v) => packProductIds.has(v.product_id))
        .map((v) => v.id)

      if (packVariantIds.length > 0) {
        const packLines = await ProductPack.query()
          .whereIn('pack_id', [...packProductIds])
          .whereNotNull('variant_id')
          .where((q) => {
            void q.whereIn('pack_variant_id', packVariantIds).orWhereNull('pack_variant_id')
          })
          .orderBy('line_index', 'asc')
          .preload('variant', (q) => q.preload('stockData').preload('product'))

        const linesForPackVariant = (packId: number, variantId: number): typeof packLines => {
          const explicit = packLines.filter(
            (l) => l.pack_id === packId && l.pack_variant_id === variantId
          )
          if (explicit.length > 0) {
            return explicit
          }
          return packLines.filter((l) => l.pack_id === packId && l.pack_variant_id === null)
        }

        for (const parent of variants) {
          if (!packProductIds.has(parent.product_id)) {
            continue
          }
          const chosenLines = linesForPackVariant(parent.product_id, parent.id)
          const items: PackItem[] = []
          for (const line of chosenLines) {
            if (!line.variant) {
              continue
            }
            const v = line.variant
            const childIsReserve = !!v.stockData?.bin_picking_number
            const quantityPerPack =
              line.quantity !== null && Number.isFinite(line.quantity) && line.quantity > 0
                ? line.quantity
                : 1
            items.push({
              sku: v.sku,
              title: `Item Pack (${v.sku}): ${v.product?.title ?? v.title}`,
              quantity: quantityPerPack,
              stock: v.stock,
              available: v.stock >= 1,
              discount_price: v.discount_price ?? null,
              image: v.image ?? null,
              is_reserve: childIsReserve,
              bin_picking_number: v.stockData?.bin_picking_number ?? null,
              date_reserve: childIsReserve ? (v.reserve ?? null) : null,
            } satisfies PackItem)
          }
          packItemsByVariantId.set(parent.id, items)
        }
      }
    }

    const data: SkuStockItem[] = variants.map((v) => {
      const isReserve = !!v.stockData?.bin_picking_number
      const isPack = packProductIds.has(v.product_id)

      return {
        sku: v.sku,
        title: v.product?.title ?? v.title,
        stock: v.stock,
        available: v.stock >= 1,
        discount_price: v.discount_price ?? null,
        image: v.image ?? null,
        is_reserve: isReserve,
        bin_picking_number: v.stockData?.bin_picking_number ?? null,
        date_reserve: isReserve ? (v.reserve ?? null) : null,
        is_pack: isPack,
        pack_items: isPack ? (packItemsByVariantId.get(v.id) ?? []) : [],
      } satisfies SkuStockItem
    })

    return response.ok({ success: true, data })
  }

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
