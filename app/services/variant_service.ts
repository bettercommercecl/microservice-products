import Variant from '#models/variant'
import Product from '#models/product'
import CategoryService from '#services/categories_service'
// import { GeneralService } from '#services/general_service'
import env from '#start/env'
import FiltersProduct from '#models/filters_product'
import ChannelProduct from '#models/channel_product'
// import Category from '#models/category'
import Logger from '@adonisjs/core/services/logger'
// import pLimit from 'p-limit'

// ✅ INTERFACES PARA TIPADO FUERTE
// interface BigCommerceProduct { // No utilizado
//   id: number
//   product_id: number
//   categories: number[]
//   name: string
//   description: string
//   brand_id: number
//   price: number
//   sale_price: number
//   inventory_level: number
//   quantity: number
//   weight: number
//   width: number
//   depth: number
//   height: number
//   sort_order: number
//   is_featured: boolean
//   is_visible: boolean
//   meta_keywords?: string[]
//   meta_description?: string
//   custom_url?: {
//     url: string
//   }
//   images: Array<{
//     is_thumbnail: boolean
//     url_standard: string
//     url_zoom: string
//     description: string
//     sort_order: number
//   }>
//   variants: Array<{
//     id: number
//     sku: string
//     price: number
//     sale_price: number | null
//     calculated_price: number
//     inventory_level: number
//     calculated_weight: number
//     width: number
//     depth: number
//     height: number
//     image_url: string
//     option_values: any[]
//     value_id: number
//   }>
// }

// Función utilitaria para reintentar una promesa ante timeout
// async function withRetry(fn: () => Promise<any>, retries = 3, delay = 2000) {
//   for (let i = 0; i < retries; i++) {
//     try {
//       return await fn()
//     } catch (err: any) {
//       if (i === retries - 1) throw err
//       if (err.code === 'ETIMEDOUT' || err.message?.includes('ETIMEDOUT')) {
//         await new Promise((res) => setTimeout(res, delay))
//       } else {
//         throw err
//       }
//     }
//   }
// }

export default class VariantService {
  private readonly logger = Logger.child({ service: 'VariantService' })
  private categoryService: CategoryService
  constructor() {
    this.categoryService = new CategoryService()
  }

  /**
   * 🔄 Sincroniza las variantes por producto
   * Responsabilidad: Gestionar variantes y sus propiedades
   */
  // async syncVariantsByProduct(products: BigCommerceProduct[]) {
  //   this.logger.info('🔄 Iniciando sincronización de variantes...')
  //   const failedVariants: any[] = []
  //   const batchSize = 20 // Aumentar batch size
  //   const limit = pLimit(8) // Aumentar concurrencia a 8

  //   try {
  //     console.time('Procesamiento total de variantes')

  //     // Cache de categorías para evitar queries repetidas
  //     const categoryCache = new Map()
  //     const childTags = await CategoryService.getChildCategories(Number(env.get('ID_BENEFITS')))
  //     const childCampaigns = await CategoryService.getChildCategories(
  //       Number(env.get('ID_CAMPAIGNS'))
  //     )

  //     // Procesar productos en batches más grandes
  //     for (let i = 0; i < products.length; i += batchSize) {
  //       const batch = products.slice(i, i + batchSize)
  //       this.logger.info(
  //         `📦 Procesando batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} (${batch.length} productos)`
  //       )

  //       await Promise.all(
  //         batch.map((product) =>
  //           limit(async () => {
  //             try {
  //               console.time(`Producto ${product.id} - TOTAL`)

  //               // 1. FORMATVARIANTSBYPRODUCT
  //               const variants = await withRetry(() =>
  //                 GeneralService.formatVariantsByProduct(product as any)
  //               )

  //               if (!Array.isArray(variants) || variants.length === 0) {
  //                 this.logger.info(`⚠️ Producto ${product.id} - Sin variantes`)
  //                 console.timeEnd(`Producto ${product.id} - TOTAL`)
  //                 return
  //               }

  //               // Log informativo del número de variantes
  //               this.logger.info(
  //                 `📦 Producto ${product.id}: procesando ${variants.length} variantes`
  //               )

  //               // 2. ELIMINAR VARIANTES ANTERIORES
  //               await Variant.query().where('product_id', product.id).delete()

  //               // 3. PROCESAR CATEGORÍAS
  //               const categoryIds = Array.isArray(product.categories)
  //                 ? product.categories.map((cat: any) => cat.category_id || cat)
  //                 : []

  //               let categoryTitles: string[] = []
  //               if (categoryIds.length > 0) {
  //                 // Usar cache para evitar queries repetidas
  //                 const uncachedIds = categoryIds.filter((id) => !categoryCache.has(id))
  //                 if (uncachedIds.length > 0) {
  //                   const categoryRecords = await Category.query().whereIn(
  //                     'category_id',
  //                     uncachedIds
  //                   )
  //                   categoryRecords.forEach((cat) => {
  //                     categoryCache.set(cat.category_id, cat.title)
  //                   })
  //                 }
  //                 categoryTitles = categoryIds.map((id) => categoryCache.get(id)).filter(Boolean)
  //               }

  //               // 4. QUERIES DE TAGS/CAMPAIGNS
  //               const [tags, campaigns] = await Promise.all([
  //                 CategoryService.getCampaignsByCategory(product.id, childTags),
  //                 CategoryService.getCampaignsByCategory(product.id, childCampaigns),
  //               ])

  //               const keywords = [...categoryTitles, ...tags, ...campaigns]
  //                 .filter(Boolean)
  //                 .join(', ')

  //               // 5. CREAR VARIANTES
  //               await Promise.all(
  //                 variants.map(async (variant: any) => {
  //                   try {
  //                     // 🔍 DEBUG: Mostrar datos que se van a guardar
  //                     const variantData = {
  //                       id: variant.id,
  //                       product_id: product.id,
  //                       title: variant.main_title,
  //                       sku: variant.sku,
  //                       normal_price: variant.normal_price,
  //                       discount_price: variant.discount_price,
  //                       cash_price: variant.cash_price,
  //                       discount_rate: variant.discount_rate,
  //                       stock: variant.stock,
  //                       warning_stock: variant.warning_stock,
  //                       image: variant.image || '', // 🚀 CORREGIDO: Usar variant.image como campo principal
  //                       images: Array.isArray(variant.images) ? variant.images : [],
  //                       hover: variant.hover,
  //                       quantity: variant.quantity,
  //                       armed_cost: variant.armed_cost,
  //                       armed_quantity: variant.armed_quantity,
  //                       weight: variant.weight,
  //                       height: variant.height,
  //                       width: variant.width,
  //                       depth: variant.depth,
  //                       type: variant.type,
  //                       options: Array.isArray(variant.options) ? variant.options : [],
  //                       keywords: keywords,
  //                     }

  //                     // Log informativo de guardado de variante
  //                     this.logger.info(`💾 Guardando variante ${variant.id} (SKU: ${variant.sku})`)

  //                     await Variant.create(variantData)
  //                     this.logger.info(`✅ Variante ${variant.id} guardada exitosamente`)
  //                   } catch (error) {
  //                     this.logger.error(
  //                       `❌ Error al guardar variante ${variant.id} (SKU: ${variant.sku}):`,
  //                       error
  //                     )
  //                     failedVariants.push({
  //                       product_id: product.id,
  //                       variant_id: variant.id,
  //                       sku: variant.sku,
  //                       error: error instanceof Error ? error.message : 'Error desconocido',
  //                     })
  //                   }
  //                 })
  //               )
  //               this.logger.info(`✅ Guardadas variantes para producto ${product.id} en variants`)
  //               console.timeEnd(`Producto ${product.id} - TOTAL`)
  //             } catch (error) {
  //               this.logger.error(`❌ Error procesando producto ${product.id}:`, error)
  //               failedVariants.push({
  //                 product_id: product.id,
  //                 error: error instanceof Error ? error.message : 'Error desconocido',
  //               })
  //             }
  //           })
  //         )
  //       )
  //     }

  //     console.timeEnd('Procesamiento total de variantes')

  //     // 🔍 DEBUG: Mostrar resumen final
  //     this.logger.info('📊 RESUMEN FINAL DE SINCRONIZACIÓN DE VARIANTES:', {
  //       total_productos_procesados: products.length,
  //       variantes_fallidas: failedVariants.length,
  //       detalles_errores: failedVariants.length > 0 ? failedVariants : 'Sin errores',
  //     })

  //     return {
  //       success: failedVariants.length === 0,
  //       message:
  //         failedVariants.length > 0
  //           ? `Algunas variantes no se sincronizaron correctamente (${failedVariants.length} errores)`
  //           : 'Variantes sincronizadas correctamente',
  //       failed: failedVariants,
  //       meta: {
  //         total_products: products.length,
  //         failed_count: failedVariants.length,
  //         timestamp: new Date().toISOString(),
  //       },
  //     }
  //   } catch (error) {
  //     this.logger.error('❌ Error general en sincronización de variantes:', error)
  //     return {
  //       success: false,
  //       message: 'Error al sincronizar variantes',
  //       error: error instanceof Error ? error.message : 'Error desconocido',
  //     }
  //   }
  // }

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
    const childTags = await this.categoryService.getChildCategories(Number(env.get('ID_BENEFITS')))
    const childCampaigns = await this.categoryService.getChildCategories(
      Number(env.get('ID_CAMPAIGNS'))
    )

    if (variants) {
      this.logger.info(`📦 Formateando ${variants.length} variantes...`)
      const formattedVariants = await Promise.all(
        variants.map(async (variant) => {
          // Buscar el producto y precargar las categorías y la marca
          const product = await Product.query()
            .where('id', variant.product_id)
            .preload('categoryProducts')
            .preload('brand')
            .first()

          // Las categorías ya vienen parseadas del modelo
          const variantCategories = variant.categories || []

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
            categories: variantCategories,
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
