import BigCommerceService from './BigCommerceService.js'
import Variant from '../models/Variant.js'
import Product from '../models/Product.js'
import CategoryProduct from '../models/CategoryProduct.js'
import CategoryService from './CategoryService.js'
import env from '#start/env'

export default class ProductService {
  private bigCommerceService: BigCommerceService

  constructor() {
    this.bigCommerceService = new BigCommerceService()
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
      throw new Error(
        `Error al obtener variantes: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  public async formatVariants(variants?: Variant[]) {
    // Obtener todos los category_id que son hijos de la categoría
    const childTags = await CategoryService.getChildCategories(Number(env.get('ID_BENEFITS')))
    const childCampaigns = await CategoryService.getChildCategories(Number(env.get('ID_CAMPAIGNS')))
    if (variants) {
      const formattedVariants = await Promise.all(
        variants.map(async (variant) => {
          // Buscar el producto y precargar las categorías y la marca
          const product = await Product.query()
            .where('id', variant.product_id)
            .preload('categories')
            .preload('brand')
            .first()

          // Extraer los category_id de la relación categories
          const categories_array = product
            ? product.categories.map((catProd: CategoryProduct) => catProd.category_id)
            : []
          let tags: string[] = []
          let campaigns: string[] = []
          if (product) {
            tags = await CategoryService.getCampaignsByCategory(product.id, childTags)
            tags = tags.length ? [...new Set(tags)] : []
            campaigns = await CategoryService.getCampaignsByCategory(product.id, childCampaigns)
            campaigns = campaigns.length ? [...new Set(campaigns)] : []
          }

          return {
            id: variant.id,
            product_id: variant.product_id,
            image: variant.image,
            images: variant.images,
            hover: !variant.hover ? product?.hover : variant.hover,
            title: variant.title,
            page_title: variant.title,
            description: product?.description,
            sku:variant.sku,
            brand_id: product?.brand_id,
            categories_array: categories_array,
            categories: categories_array,
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
            reviews: product?.reviews,
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
            keywords : variant.keywords
          }
        })
      )
      return formattedVariants
    } else {
      // fetch all variants and format them
    }
    return []
  }


  public async getVariantsByIds(ids: number[]) {
    try {
      // Convertir los IDs a números y filtrar valores no válidos
      const numericIds = ids.map(Number).filter(id => !isNaN(id))
      const variants = await Variant.query().whereIn('id', numericIds)
      // No es necesario filtrar nulos porque whereIn solo devuelve los que existen
      return {
        success: true,
        data: variants,
      }
    } catch (error) {
      throw new Error(
        `Error al obtener variantes por IDs: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  // Nuevo: variantes paginadas
  public async getAllVariantsPaginated(page = 1, limit = 200, channelId?: number) {
    if (channelId) {
      // Buscar los product_id que están en el canal
      const channelProducts = await (await import('#models/ChannelProduct')).default.query().where('channel_id', channelId)
      const productIds = channelProducts.map(cp => cp.product_id)
      if (productIds.length === 0) {
        // Si no hay productos en el canal, retorna paginación vacía
        return { data: [], meta: { pagination: { total: 0, per_page: limit, current_page: page, total_pages: 0 } } }
      }
      return await Variant.query().whereIn('product_id', productIds).paginate(page, limit)
    } else {
      return await Variant.query().paginate(page, limit)
    }
  }
}
