import type {
  ProductPaginatedResult,
  ProductRepositoryPort,
} from '#application/ports/product_repository.port'
import ChannelProduct from '#models/channel_product'
import Product from '#models/product'

/**
 * Implementacion  de lectura de productos
 */
export default class ProductRepository implements ProductRepositoryPort {
  async findAll(): Promise<unknown[]> {
    const products = await Product.all()
    return products
  }

  async findById(id: number): Promise<unknown | null> {
    const product = await Product.query().where('id', id).first()
    return product ?? null
  }

  async findPaginated(page: number, limit: number): Promise<ProductPaginatedResult> {
    const paginated = await Product.query().orderBy('id', 'asc').paginate(page, limit)
    const data = paginated.all()
    const meta = paginated.getMeta()
    return { data, meta }
  }

  async findReviewsPaginated(page: number, limit: number): Promise<ProductPaginatedResult> {
    const paginated = await Product.query()
      .select(['id', 'product_id', 'reviews'])
      .whereNotNull('reviews')
      .whereRaw("reviews::jsonb <> '[]'::jsonb")
      .orderBy('id', 'asc')
      .paginate(page, limit)
    const data = paginated.all()
    const meta = paginated.getMeta()
    return { data, meta }
  }

  async findPaginatedByChannel(
    channelId: number,
    page: number,
    limit: number
  ): Promise<ProductPaginatedResult> {
    const productIdsSubquery = ChannelProduct.query()
      .select('product_id')
      .where('channel_id', channelId)
    const paginated = await Product.query()
      .whereIn('id', productIdsSubquery)
      .preload('variants')
      .orderBy('id', 'asc')
      .paginate(page, limit)
    const data = paginated.all()
    const meta = paginated.getMeta()
    return { data, meta }
  }
}
