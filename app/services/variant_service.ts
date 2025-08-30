import Variant from '../models/variant.js'
import Product from '../models/product.js'
import CategoryProduct from '../models/category_product.js'
import CategoryService from './category_service.js'
import env from '#start/env'
import FiltersProduct from '../models/filters_product.js'
import ChannelProduct from '#models/channel_product'
import Logger from '@adonisjs/core/services/logger'

export default class ProductService {
  private readonly logger = Logger.child({ service: 'ProductService' })

  constructor() {
    // Constructor vacío - servicios inicializados cuando se necesiten
  }

  /**
   * Obtiene todas las variantes (Productos)
   */
  async getAllVariants() {
    try {
      this.logger.info('🔍 Obteniendo todas las variantes...')
      const variants = await Variant.all()
      this.logger.info(`✅ Variantes obtenidas exitosamente: ${variants.length} variantes`)
      return {
        success: true,
        data: variants,
      }
    } catch (error) {
      this.logger.error('❌ Error al obtener variantes:', error)
      throw new Error(
        `Error al obtener variantes: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  public async formatVariants(variants?: Variant[]) {
    this.logger.info('🔄 Iniciando formateo de variantes...')

    // Obtener todos los category_id que son hijos de la categoría
    this.logger.info('📋 Obteniendo categorías hijas para tags y campañas...')
    const childTags = await CategoryService.getChildCategories(Number(env.get('ID_BENEFITS')))
    const childCampaigns = await CategoryService.getChildCategories(Number(env.get('ID_CAMPAIGNS')))

    if (variants) {
      this.logger.info(`📦 Formateando ${variants.length} variantes...`)
      const formattedVariants = await Promise.all(
        variants.map(async (variant) => {
          // Buscar el producto y precargar las categorías y la marca
          const product = await Product.query()
            .where('id', variant.product_id)
            .preload('categories')
            .preload('brand')
            .first()

          // Extraer los category_id de la relación categories
          const categoriesArray = product
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
            sku: variant.sku,
            brand_id: product?.brand_id,
            categoriesArray: categoriesArray,
            categories: categoriesArray,
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
            keywords: variant.keywords,
          }
        })
      )
      this.logger.info(`✅ Formateo completado: ${formattedVariants.length} variantes procesadas`)
      return formattedVariants
    } else {
      this.logger.info('📋 No se proporcionaron variantes para formatear')
      // fetch all variants and format them
    }
    return []
  }

  public async getVariantsByIds(ids: number[]) {
    try {
      this.logger.info(`🔍 Obteniendo variantes por IDs: ${ids.length} IDs proporcionados`)

      // Convertir los IDs a números y filtrar valores no válidos
      const numericIds = ids.map(Number).filter((id) => !Number.isNaN(id))
      this.logger.info(`📊 IDs válidos después de filtrado: ${numericIds.length}`)

      const variants = await Variant.query()
        .whereIn('variants.id', numericIds)
        .join('products', 'variants.product_id', 'products.id')
        .where('products.is_visible', true)
        .select('variants.*')

      this.logger.info(`✅ Variantes obtenidas exitosamente: ${variants.length} variantes`)
      // No es necesario filtrar nulos porque whereIn solo devuelve los que existen
      return {
        success: true,
        data: variants,
      }
    } catch (error) {
      this.logger.error('❌ Error al obtener variantes por IDs:', error)
      throw new Error(
        `Error al obtener variantes por IDs: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  // Nuevo: variantes paginadas
  public async getAllVariantsPaginated(page = 1, limit = 200, channelId?: number) {
    this.logger.info(
      `📄 Obteniendo variantes paginadas: página ${page}, límite ${limit}${channelId ? `, canal ${channelId}` : ''}`
    )

    if (channelId) {
      // Buscar los product_id que están en el canal
      this.logger.info(`🔍 Buscando productos en canal ${channelId}...`)
      const channelProducts = await ChannelProduct.query().where('channel_id', channelId)
      const productIds = channelProducts.map((cp) => cp.product_id)
      this.logger.info(`📊 Productos encontrados en canal: ${productIds.length}`)

      if (productIds.length === 0) {
        this.logger.warn(
          `⚠️ No hay productos en el canal ${channelId}, retornando paginación vacía`
        )
        // Si no hay productos en el canal, retorna paginación vacía
        return {
          data: [],
          meta: { pagination: { total: 0, per_page: limit, current_page: page, total_pages: 0 } },
        }
      }
      this.logger.info(`📊 Obteniendo variantes paginadas para ${productIds.length} productos...`)
      const paginated = await Variant.query()
        .whereIn('product_id', productIds)
        .paginate(page, limit)

      // Agregar filters a cada variante
      this.logger.info('🔧 Agregando filtros a variantes...')
      const variantsWithFilters = await Promise.all(
        paginated.all().map(async (variant) => {
          const filtersResult = await FiltersProduct.query().where('product_id', variant.product_id)
          const filters = filtersResult.map((fp) => fp.category_id)
          const variantData = variant.toJSON()
          return { ...variantData, filters }
        })
      )

      this.logger.info(
        `✅ Variantes con filtros obtenidas: ${variantsWithFilters.length} variantes`
      )
      return { data: variantsWithFilters, meta: paginated.getMeta() }
    } else {
      this.logger.info('📊 Obteniendo todas las variantes paginadas...')
      const paginated = await Variant.query().paginate(page, limit)

      this.logger.info('🔧 Agregando filtros a variantes...')
      const variantsWithFilters = await Promise.all(
        paginated.all().map(async (variant) => {
          const filtersResult = await FiltersProduct.query().where('product_id', variant.product_id)
          const filters = filtersResult.map((fp) => fp.category_id)

          const variantData = variant.toJSON()
          return { ...variantData, filters }
        })
      )

      this.logger.info(
        `✅ Variantes con filtros obtenidas: ${variantsWithFilters.length} variantes`
      )
      return { data: variantsWithFilters, meta: paginated.getMeta() }
    }
  }
}
