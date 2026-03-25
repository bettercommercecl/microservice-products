import type {
  VariantPaginatedMeta,
  VariantRepositoryPort,
} from '#application/ports/variant_repository.port'
import Variant from '#models/variant'
import Database from '@adonisjs/lucid/services/db'
import { omitTimestampKeysFromRows, serializeTableRows } from '#utils/serialize_table_row'

/**
 * Implementacion del port de lectura de variantes usando modelos Lucid.
 */
export default class VariantRepository implements VariantRepositoryPort {
  async findAll(): Promise<unknown[]> {
    const variants = await Variant.all()
    return variants
  }

  async findByIds(ids: number[]): Promise<unknown[]> {
    const numericIds = ids.map(Number).filter((id) => !Number.isNaN(id))
    if (numericIds.length === 0) return []
    const variants = await Variant.query()
      .whereIn('variants.id', numericIds)
      .join('products', 'variants.product_id', 'products.id')
      .where('products.is_visible', true)
      .select('variants.*')
    return variants
  }

  async findPaginatedTableShape(
    page: number,
    limit: number,
    channelId?: number
  ): Promise<{ data: Record<string, unknown>[]; meta: VariantPaginatedMeta }> {
    const baseQuery = Database.from('variants')
    const countQuery = channelId
      ? baseQuery
          .clone()
          .join('channel_product', 'variants.product_id', 'channel_product.product_id')
          .where('channel_product.channel_id', channelId)
      : baseQuery.clone()
    const totalResult = await countQuery.count('* as total').first()
    const total = Number(totalResult?.total ?? 0)
    let rowsQuery = Database.from('variants').select('variants.*')
    if (channelId) {
      rowsQuery = rowsQuery
        .join('channel_product', 'variants.product_id', 'channel_product.product_id')
        .where('channel_product.channel_id', channelId)
    }
    const rows = await rowsQuery
      .orderBy('variants.id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
    const data = omitTimestampKeysFromRows(serializeTableRows(rows as Record<string, unknown>[]))
    const lastPage = Math.max(1, Math.ceil(total / limit))
    return {
      data,
      meta: { total, perPage: limit, currentPage: page, lastPage },
    }
  }

  async findPaginatedByChannelWithProduct(
    channelId: number,
    page: number,
    limit: number,
    parentCategoryId?: number
  ): Promise<{ data: unknown[]; meta: VariantPaginatedMeta }> {
    const query = Variant.query()
      .join('channel_product', 'variants.product_id', 'channel_product.product_id')
      .where('channel_product.channel_id', channelId)
      .select('variants.*')
      .preload('product')
      .orderBy('variants.id', 'asc')
    if (parentCategoryId != null) {
      query.whereExists((sub) => {
        sub
          .from('category_products')
          .select('id')
          .where('category_id', parentCategoryId)
          .whereRaw('category_products.product_id = variants.product_id')
      })
    }

    const paginated = await query.paginate(page, limit)
    const data = paginated.all()
    const lastPage = Math.max(1, Math.ceil(paginated.total / limit))
    const meta: VariantPaginatedMeta = {
      total: paginated.total,
      perPage: limit,
      currentPage: page,
      lastPage,
    }
    return { data, meta }
  }
}
