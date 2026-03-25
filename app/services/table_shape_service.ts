import Database from '@adonisjs/lucid/services/db'
import { omitTimestampKeysFromRows, serializeTableRows } from '#utils/serialize_table_row'

const DATE_KEYS = ['created_at', 'updated_at']

function buildMeta(total: number, page: number, limit: number) {
  const lastPage = Math.max(1, Math.ceil(total / limit))
  return { total, perPage: limit, currentPage: page, lastPage }
}

/**
 * Servicio que expone datos en estructura de tabla (columnas tal cual)
 * con timestamps serializados en ISO para GET desde marcas y persistir.
 */
export default class TableShapeService {
  /**
   * products_packs: todos los registros paginados.
   */
  async getPacksPaginated(page: number, limit: number) {
    const totalResult = await Database.from('products_packs').count('* as total').first()
    const total = Number(totalResult?.total ?? 0)
    const rows = await Database.from('products_packs')
      .select('*')
      .orderBy('id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
    const data = omitTimestampKeysFromRows(
      serializeTableRows(rows as Record<string, unknown>[], DATE_KEYS)
    )
    return { data, meta: buildMeta(total, page, limit) }
  }

  /**
   * products_packs del canal: pack_id debe estar en productos del canal.
   */
  async getPacksByChannel(channelId: number, page: number, limit: number) {
    const productIdsSubquery = () =>
      Database.from('channel_product').select('product_id').where('channel_id', channelId)
    const totalResult = await Database.from('products_packs')
      .whereIn('pack_id', productIdsSubquery())
      .count('* as total')
      .first()
    const total = Number(totalResult?.total ?? 0)
    const rows = await Database.from('products_packs')
      .select('*')
      .whereIn('pack_id', productIdsSubquery())
      .orderBy('id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
    const data = omitTimestampKeysFromRows(
      serializeTableRows(rows as Record<string, unknown>[], DATE_KEYS)
    )
    return { data, meta: buildMeta(total, page, limit) }
  }

  /**
   * options: todos los registros paginados.
   */
  async getOptionsPaginated(page: number, limit: number) {
    const totalResult = await Database.from('options').count('* as total').first()
    const total = Number(totalResult?.total ?? 0)
    const rows = await Database.from('options')
      .select([
        // Orden intencional para compatibilidad con el consumidor (marca).
        'option_id',
        'label',
        'product_id',
        'options',
        'created_at',
        'updated_at',
        'id',
      ])
      .orderBy('id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
    // Para este endpoint la marca espera timestamps en formato ISO.
    // Además, normalizamos la columna JSON `options` si viniera como string.
    const data = serializeTableRows(rows as Record<string, unknown>[], DATE_KEYS, ['options'])
    return { data, meta: buildMeta(total, page, limit) }
  }

  /**
   * options del canal: product_id en productos del canal.
   */
  async getOptionsByChannel(channelId: number, page: number, limit: number) {
    const productIdsSubquery = () =>
      Database.from('channel_product').select('product_id').where('channel_id', channelId)
    const totalResult = await Database.from('options')
      .whereIn('product_id', productIdsSubquery())
      .count('* as total')
      .first()
    const total = Number(totalResult?.total ?? 0)
    const rows = await Database.from('options')
      .select([
        // Orden intencional para compatibilidad con el consumidor (marca).
        'option_id',
        'label',
        'product_id',
        'options',
        'created_at',
        'updated_at',
        'id',
      ])
      .whereIn('product_id', productIdsSubquery())
      .orderBy('id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
    // Para este endpoint la marca espera timestamps en formato ISO.

    const data = serializeTableRows(rows as Record<string, unknown>[], DATE_KEYS, ['options'])
    return { data, meta: buildMeta(total, page, limit) }
  }

  /**
   * category_products: todos los registros paginados.
   */
  async getCategoryProductsPaginated(page: number, limit: number) {
    const totalResult = await Database.from('category_products').count('* as total').first()
    const total = Number(totalResult?.total ?? 0)
    const rows = await Database.from('category_products')
      .select(['id', 'category_id', 'product_id', 'created_at', 'updated_at'])
      .orderBy('id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
    // Para este endpoint la marca espera timestamps en formato ISO.
    const data = serializeTableRows(rows as Record<string, unknown>[], DATE_KEYS)
    return { data, meta: buildMeta(total, page, limit) }
  }

  /**
   * category_products del canal: product_id en productos del canal.
   */
  async getCategoryProductsByChannel(channelId: number, page: number, limit: number) {
    const productIdsSubquery = () =>
      Database.from('channel_product').select('product_id').where('channel_id', channelId)
    const totalResult = await Database.from('category_products')
      .whereIn('product_id', productIdsSubquery())
      .count('* as total')
      .first()
    const total = Number(totalResult?.total ?? 0)
    const rows = await Database.from('category_products')
      .select(['id', 'category_id', 'product_id', 'created_at', 'updated_at'])
      .whereIn('product_id', productIdsSubquery())
      .orderBy('id', 'asc')
      .limit(limit)
      .offset((page - 1) * limit)
    // Para este endpoint la marca espera timestamps en formato ISO.
    const data = serializeTableRows(rows as Record<string, unknown>[], DATE_KEYS)
    return { data, meta: buildMeta(total, page, limit) }
  }
}
