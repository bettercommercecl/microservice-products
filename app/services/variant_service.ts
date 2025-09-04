import Variant from '#models/variant'
import Product from '#models/product'
import CategoryService from '#services/categories_service'
import env from '#start/env'
import FiltersProduct from '#models/filters_product'
import ChannelProduct from '#models/channel_product'
import Logger from '@adonisjs/core/services/logger'

export default class VariantService {
  private readonly logger = Logger.child({ service: 'VariantService' })
  private categoryService: CategoryService
  constructor() {
    this.categoryService = new CategoryService()
  }

  /**
   * Obtiene todas las variantes (Productos)
   */
  async getAllVariants() {
    try {
      const variants = await Variant.all()
      return {
        success: true,
        data: variants,
      }
    } catch (error) {
      this.logger.error('❌ Error al obtener variantes', { error: error.message })
      throw new Error(
        `Error al obtener variantes: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  public async formatVariants(variants?: Variant[]) {
    try {
      // Obtener todos los category_id que son hijos de la categoría
      const childTags = await this.categoryService.getChildCategories(
        Number(env.get('ID_BENEFITS'))
      )
      const childCampaigns = await this.categoryService.getChildCategories(
        Number(env.get('ID_CAMPAIGNS'))
      )

      if (variants) {
        const formattedVariants = await Promise.all(
          variants.map(async (variant) => {
            // Buscar el producto y precargar las categorías y la marca
            const product = await Product.query()
              .where('id', variant.product_id)
              .preload('categoryProducts')
              .preload('brand')
              .first()
            // Las categorías vienen del producto a través de la relación categoryProducts
            const variantCategories = product?.categoryProducts
              ? product.categoryProducts.map((catProd: any) => catProd.category_id)
              : []

            let tags: string[] = []
            let campaigns: string[] = []
            if (product) {
              tags = await this.categoryService.getCampaignsByCategory(product.id, childTags)
              tags = tags.length ? [...new Set(tags)] : []
              campaigns = await this.categoryService.getCampaignsByCategory(
                product.id,
                childCampaigns
              )
              campaigns = campaigns.length ? [...new Set(campaigns)] : []
            }

            // Parsear reviews manualmente ya que preload no aplica serialización
            let parsedReviews = null
            if (product?.reviews) {
              try {
                parsedReviews =
                  typeof product.reviews === 'string'
                    ? JSON.parse(product.reviews)
                    : product.reviews
              } catch (error) {
                this.logger.warn(`❌ Error parseando reviews para producto ${product.id}:`, error)
                parsedReviews = null
              }
            }

            return {
              id: variant.id,
              product_id: variant.product_id,
              image: variant.image,
              images: variant.images,
              hover: product?.hover || null,
              title: variant.title,
              page_title: variant.title,
              description: product?.description,
              sku: variant.sku,
              brand_id: product?.brand_id,
              categoriesArray: variantCategories,
              categories: variantCategories, // ✅ Ya viene parseado del modelo
              stock: variant.stock,
              warning_stock: variant.warning_stock,
              normal_price: variant.normal_price,
              discount_price: variant.discount_price,
              cash_price: variant.cash_price,
              percent: variant.discount_rate,
              url: product?.url,
              type: product?.type,
              quantity: 0,
              armed_cost: 0,
              weight: product?.weight,
              sort_order: product?.sort_order,
              reserve: product?.reserve,
              reviews: parsedReviews,
              sameday: product?.sameday,
              free_shipping: product?.free_shipping,
              despacho24horas: product?.despacho24horas,
              featured: product?.featured,
              pickup_in_store: product?.pickup_in_store,
              is_visible: product?.is_visible,
              turbo: product?.turbo,
              meta_keywords: product?.meta_keywords,
              meta_description: product?.meta_description,
              variants: [],
              options: [],
              packs: [],
              sizes: [],
              tags: tags,
              campaigns: campaigns,
              brand: product?.brand ? product.brand.name : null,
              keywords: variant.keywords,
            }
          })
        )
        return formattedVariants
      }
      return []
    } catch (error) {
      this.logger.error('❌ Error formateando variantes', { error: error.message })
      throw error
    }
  }

  public async getVariantsByIds(ids: number[]) {
    try {
      // Convertir los IDs a números y filtrar valores no válidos
      const numericIds = ids.map(Number).filter((id) => !Number.isNaN(id))

      const variants = await Variant.query()
        .whereIn('variants.id', numericIds)
        .join('products', 'variants.product_id', 'products.id')
        .where('products.is_visible', true)
        .select('variants.*')

      return {
        success: true,
        data: variants,
      }
    } catch (error) {
      this.logger.error('❌ Error al obtener variantes por IDs', { ids, error: error.message })
      throw new Error(
        `Error al obtener variantes por IDs: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  // Nuevo: variantes paginadas
  public async getAllVariantsPaginated(page = 1, limit = 200, channelId?: number) {
    try {
      if (channelId) {
        // Buscar los product_id que están en el canal
        const channelProducts = await ChannelProduct.query().where('channel_id', channelId)
        const productIds = channelProducts.map((cp) => cp.product_id)

        if (productIds.length === 0) {
          // Si no hay productos en el canal, retorna paginación vacía
          return {
            data: [],
            meta: { pagination: { total: 0, per_page: limit, current_page: page, total_pages: 0 } },
          }
        }

        const paginated = await Variant.query()
          .whereIn('product_id', productIds)
          .paginate(page, limit)

        // Agregar filters a cada variante
        const variantsWithFilters = await Promise.all(
          paginated.all().map(async (variant) => {
            const filtersResult = await FiltersProduct.query().where(
              'product_id',
              variant.product_id
            )
            const filters = filtersResult.map((fp) => fp.category_id)
            const variantData = variant.toJSON()
            return { ...variantData, filters }
          })
        )

        return { data: variantsWithFilters, meta: paginated.getMeta() }
      } else {
        const paginated = await Variant.query().paginate(page, limit)

        const variantsWithFilters = await Promise.all(
          paginated.all().map(async (variant) => {
            const filtersResult = await FiltersProduct.query().where(
              'product_id',
              variant.product_id
            )
            const filters = filtersResult.map((fp) => fp.category_id)

            const variantData = variant.toJSON()
            return { ...variantData, filters }
          })
        )

        return { data: variantsWithFilters, meta: paginated.getMeta() }
      }
    } catch (error) {
      this.logger.error('❌ Error obteniendo variantes paginadas', {
        page,
        limit,
        channelId,
        error: error.message,
      })
      throw error
    }
  }
}
