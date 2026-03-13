import type { AxiosInstance } from 'axios'
import type { Logger } from '@adonisjs/core/logger'

type SortField =
  | 'id'
  | 'name'
  | 'sku'
  | 'price'
  | 'date_modified'
  | 'date_last_imported'
  | 'inventory_level'
  | 'is_visible'
  | 'total_sold'
  | 'calculated_price'

type ProductInclude =
  | 'bulk_pricing_rules'
  | 'channels'
  | 'custom_fields'
  | 'images'
  | 'modifiers'
  | 'options'
  | 'parent_relations'
  | 'primary_image'
  | 'reviews'
  | 'variants'
  | 'videos'

type ProductCondition = 'new' | 'used' | 'refurbished'
type ProductAvailability = 'available' | 'disabled' | 'preorder'
type ProductType = 'digital' | 'physical'

export interface ProductQueryParams {
  id?: number
  'id:in'?: number[] | string
  'id:not_in'?: number[] | string
  'id:min'?: number
  'id:max'?: number
  'id:greater'?: number
  'id:less'?: number
  'channel_id:in'?: number[] | string

  include?: ProductInclude[] | string
  include_fields?: string[] | string
  exclude_fields?: string[] | string

  page?: number
  limit?: number
  sort?: SortField
  direction?: 'asc' | 'desc'

  'categories:in'?: number[] | string
  categories?: number
  name?: string
  sku?: string
  'sku:in'?: string[] | string
  brand_id?: number
  type?: ProductType
  condition?: ProductCondition
  availability?: ProductAvailability
  keyword?: string
  keyword_context?: 'shopper' | 'merchant'
  mpn?: string
  upc?: string
  price?: number
  weight?: number

  is_visible?: boolean | number
  is_featured?: 0 | 1
  is_free_shipping?: 0 | 1

  inventory_level?: number
  'inventory_level:in'?: number[] | string
  'inventory_level:not_in'?: number[] | string
  'inventory_level:min'?: number
  'inventory_level:max'?: number
  'inventory_level:greater'?: number
  'inventory_level:less'?: number
  inventory_low?: 0 | 1
  out_of_stock?: 0 | 1
  total_sold?: number

  date_modified?: string
  'date_modified:min'?: string
  'date_modified:max'?: string
  date_last_imported?: string
  'date_last_imported:not'?: string
  'date_last_imported:min'?: string
  'date_last_imported:max'?: string
}

export default class ProductsApi {
  constructor(
    private readonly client: AxiosInstance,
    private readonly logger: Logger
  ) {}

  /**
   * Obtiene productos con filtros opcionales y paginación automática.
   * Si se pasan filtros, recorre todas las páginas y devuelve el resultado completo.
   */
  async getAll(filters: ProductQueryParams = {}) {
    try {
      const params = this.serializeParams({ limit: 250, ...filters })

      let allProducts: any[] = []
      let page = params.page ? Number(params.page) : 1

      while (true) {
        params.page = page

        const response = await this.client.get('/v3/catalog/products', {
          params,
          timeout: 30_000,
        })

        const { data, meta } = response.data

        if (!data || data.length === 0) break

        allProducts = allProducts.concat(data)

        const totalPages = meta?.pagination?.total_pages ?? 1
        if (page >= totalPages) break

        page++
      }

      return { data: allProducts, meta: { total: allProducts.length } }
    } catch (error) {
      this.logger.error('Error al obtener productos de BigCommerce', {
        filters,
        error: error.message,
      })
      throw new Error(
        `Error fetching products from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async getById(id: number) {
    try {
      const response = await this.client.get(`/v3/catalog/products/${id}`, { timeout: 15_000 })
      return response.data.data
    } catch (error) {
      this.logger.error('Error al obtener producto de BigCommerce', {
        product_id: id,
        error: error.message,
      })
      throw new Error(
        `Error fetching product from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async getByChannel(channel: number, page = 1, limit = 2000) {
    try {
      const response = await this.client.get('/v3/catalog/products/channel-assignments', {
        params: { 'channel_id:in': channel, limit, page },
        timeout: 15_000,
      })
      return response.data
    } catch (error) {
      this.logger.error('Error al obtener productos por canal', {
        channel_id: channel,
        page,
        limit,
        error: error.message,
      })
      return { status: error.response?.status, message: error.response?.statusText }
    }
  }

  /**
   * Obtiene productos detallados por IDs con paginación automática.
   * Usa getAll internamente con los filtros apropiados.
   */
  async getDetailedByIds(products: number[], visible = 1, parentCategory: number | null) {
    const filters: ProductQueryParams = {
      'id:in': products,
      availability: 'available',
      sort: 'id',
      direction: 'desc',
      include: ['images', 'variants'],
      limit: 250,
    }

    if (visible === 1) filters.is_visible = true
    if (parentCategory && parentCategory !== 0) filters['categories:in'] = [parentCategory]

    return this.getAll(filters)
  }

  async getMetafields(productId: number, key: string) {
    try {
      const results = await this.client.get(`/v3/catalog/products/${productId}/metafields`, {
        params: { key },
      })

      let data = results.data.data
      if (data.length > 0) {
        data = data[0].value
      }

      return data
    } catch (error) {
      this.logger.error('Error obteniendo metafield', {
        product_id: productId,
        key,
        error: error.message,
      })
      return []
    }
  }

  async getReviews(productId: number) {
    try {
      const results = await this.client.get(`/v3/catalog/products/${productId}/reviews`, {
        params: { status: 1 },
      })

      const data = results.data.data
      const arrayReviews: any[] = []
      let totalRating = 0

      for (const elem of data) {
        arrayReviews.push({
          id: elem.id,
          name: elem.name,
          title: elem.title,
          text: elem.text,
          rating: elem.rating,
          date: elem.date_reviewed,
          images_url: [],
        })
        totalRating += elem.rating
      }

      return {
        product_id: productId,
        quantity: arrayReviews.length,
        rating: arrayReviews.length > 0 ? totalRating / arrayReviews.length : 0,
        reviews: arrayReviews,
      }
    } catch (error) {
      this.logger.error('Error obteniendo reviews para producto', {
        product_id: productId,
        error: error.message,
      })
      return {
        product_id: productId,
        quantity: 0,
        rating: 0,
        reviews: [],
      }
    }
  }

  /**
   * Crea asignaciones producto-categoria en BigCommerce (payload amplio en batch).
   * PUT /v3/catalog/products/category-assignments
   * @see https://developer.bigcommerce.com/docs/rest-catalog/products/category-assignments#create-products-category-assignments
   */
  async updateCategoryAssignments(
    assignments: Array<{ product_id: number; category_id: number }>
  ): Promise<void> {
    if (assignments.length === 0) return

    const BATCH_SIZE = 250
    for (let i = 0; i < assignments.length; i += BATCH_SIZE) {
      const batch = assignments.slice(i, i + BATCH_SIZE)
      await this.client.put('/v3/catalog/products/category-assignments', batch, {
        timeout: 15_000,
      })
    }
  }

  /**
   * Elimina asignaciones producto-categoria en BigCommerce.
   * DELETE /v3/catalog/products/category-assignments (requiere al menos un filtro).
   * @see https://developer.bigcommerce.com/docs/rest-catalog/products/category-assignments#delete-products-category-assignments
   */
  async deleteCategoryAssignments(
    productIds: number[],
    categoryIds: number[]
  ): Promise<void> {
    if (productIds.length === 0 || categoryIds.length === 0) return

    const BATCH_SIZE = 250
    for (let i = 0; i < productIds.length; i += BATCH_SIZE) {
      const batch = productIds.slice(i, i + BATCH_SIZE)
      const params = this.serializeParams({
        'product_id:in': batch,
        'category_id:in': categoryIds,
      })
      await this.client.delete('/v3/catalog/products/category-assignments', {
        params,
        timeout: 15_000,
      })
    }
  }

  /**
   * Convierte arrays a strings separados por coma para los query params de BigCommerce
   */
  private serializeParams(params: Record<string, any>): Record<string, any> {
    const serialized: Record<string, any> = {}

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue
      serialized[key] = Array.isArray(value) ? value.join(',') : value
    }

    return serialized
  }
}
