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

          // Obtener los nombres de las categorías SOLO si son visibles
          let categoryNames: string[] = []
          if (categories_array.length) {
            const categories = await CategoryProduct.query()
              .whereIn('category_id', categories_array)
              .preload('category')
            categoryNames = categories
              .filter((catProd) => catProd.category?.is_visible)
              .map((catProd) => catProd.category?.title)
              .filter(Boolean)
          }

          // Obtener los labels de las opciones de la variante
          let optionLabels: string[] = []
          if (variant.options && Array.isArray(variant.options) && variant.options.length > 0) {
            // Si las opciones están serializadas como string, parsear
            let optionsArr = typeof variant.options === 'string' ? JSON.parse(variant.options) : variant.options
            optionLabels = optionsArr.map((opt: any) => opt.label).filter(Boolean)
          } else {
            // Si no están en el campo options, buscar en la tabla Option por product_id
            const OptionModel = (await import('../models/Option.js')).default
            const options = await OptionModel.query().where('product_id', variant.product_id)
            optionLabels = options.flatMap(opt => {
              if (Array.isArray(opt.options)) {
                return opt.options.map((val: any) => val.label).filter(Boolean)
              } else if (typeof opt.options === 'string') {
                try {
                  const arr = JSON.parse(opt.options)
                  return Array.isArray(arr) ? arr.map((val: any) => val.label).filter(Boolean) : []
                } catch {
                  return []
                }
              }
              return []
            })
          }

          // Unir todo en un solo string separado por coma, eliminando duplicados
          const keywordsArr = [...categoryNames, ...optionLabels]
          const keywords = Array.from(new Set(keywordsArr)).join(', ')

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
            keywords: variant.keywords,
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
      const variants = await Variant.query().whereIn('id', ids)
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
  public async getAllVariantsPaginated(page = 1, limit = 200) {
    return await Variant.query().paginate(page, limit)
  }
}
