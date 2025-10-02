import Variant from '#models/variant'
import Product from '#models/product'
import CategoryService from '#services/categories_service'
import env from '#start/env'
import FiltersProduct from '#models/filters_product'
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
            // let parsedReviews = null
            // if (product?.reviews) {
            //   try {
            //     parsedReviews =
            //       typeof product.reviews === 'string'
            //         ? JSON.parse(product.reviews)
            //         : product.reviews
            //   } catch (error) {
            //     this.logger.warn(`❌ Error parseando reviews para producto ${product.id}:`, error)
            //     parsedReviews = null
            //   }
            // }

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
              reviews: null, //parsedReviews,
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

  // Nuevo: variantes paginadas optimizadas
  public async getAllVariantsPaginated(page = 1, limit = 100, channelId?: number) {
    try {
      this.logger.info(
        `🚀 Iniciando getAllVariantsPaginated - página: ${page}, límite: ${limit}, canal: ${channelId}`
      )
      let paginated: any
      let productIds: number[] = []
      if (channelId) {
        // 🚀 OPTIMIZACIÓN: Query directa con JOIN para evitar N+1
        paginated = await Variant.query()
          .join('channel_product', 'variants.product_id', 'channel_product.product_id')
          .where('channel_product.channel_id', channelId)
          .where('variants.is_visible', '=', true)
          .select('variants.*')
          .paginate(page, limit)

        // Obtener product_ids de las variantes paginadas
        productIds = paginated.all().map((variant: any) => variant.product_id)
      } else {
        // 🚀 OPTIMIZACIÓN: Query más eficiente sin JOIN innecesario
        paginated = await Variant.query().where('is_visible', '=', true).paginate(page, limit)

        // Obtener todos los product_ids de las variantes paginadas
        productIds = paginated.all().map((variant: any) => variant.product_id)
      }

      // 🚀 OPTIMIZACIÓN: Obtener todos los filtros en una sola query
      const filtersMap = new Map<number, number[]>()
      if (productIds.length > 0) {
        const allFilters = await FiltersProduct.query().whereIn('product_id', productIds)
        allFilters.forEach((filter) => {
          if (!filtersMap.has(filter.product_id)) {
            filtersMap.set(filter.product_id, [])
          }
          filtersMap.get(filter.product_id)!.push(filter.category_id)
        })
      }

      // 🚀 OPTIMIZACIÓN MASIVA: Cargar todos los datos de productos en una sola query
      this.logger.info(`🔍 Cargando productos para ${productIds.length} productIds`)
      const uniqueProductIds = [...new Set(productIds)]
      const productsMap = new Map<number, any>()

      if (uniqueProductIds.length > 0) {
        this.logger.info(
          `🔍 Ejecutando query de productos para ${uniqueProductIds.length} productos únicos`
        )
        const products = await Product.query()
          .whereIn('id', uniqueProductIds)
          .preload('categoryProducts')
          .preload('brand')

        this.logger.info(`✅ Productos cargados: ${products.length}`)
        products.forEach((product) => {
          productsMap.set(product.id, product)
        })
      }

      // 🚀 OPTIMIZACIÓN: Procesar variantes sin serialización innecesaria
      this.logger.info(`🔍 Procesando ${paginated.all().length} variantes`)
      const variantsWithFilters = paginated.all().map((variant: any) => {
        const filters = filtersMap.get(variant.product_id) || []
        const product = productsMap.get(variant.product_id)

        // 📦 Construir estructura optimizada (solo campos esenciales)
        const processedVariant = {
          id: variant.id,
          product_id: variant.product_id,
          image: variant.image,
          images: this.parseJsonField(variant.images), // 🚀 Directo del objeto, no toJSON()
          title: variant.title,
          page_title: variant.title,
          sku: variant.sku,
          stock: variant.stock,
          warning_stock: variant.warning_stock,
          normal_price: variant.normal_price,
          discount_price: variant.discount_price,
          cash_price: variant.cash_price,
          percent: variant.discount_rate,
          keywords: variant.keywords,
          filters, // 🎯 Conservar los filtros del canal
          // 🚀 Campos del producto solo si existe
          ...(product && {
            hover: product.hover,
            description: product.description,
            brand_id: product.brand_id,
            url: product.url,
            type: product.type,
            weight: product.weight,
            sort_order: product.sort_order,
            reserve: product.reserve,
            sameday: product.sameday,
            free_shipping: product.free_shipping,
            despacho24horas: product.despacho24horas,
            featured: product.featured,
            pickup_in_store: product.pickup_in_store,
            is_visible: product.is_visible,
            turbo: product.turbo,
            meta_keywords: product.meta_keywords,
            meta_description: product.meta_description,
            brand: product.brand?.name || null,
            categoriesArray: product.categoryProducts?.map((cp: any) => cp.category_id) || [],
            categories: product.categoryProducts?.map((cp: any) => cp.category_id) || [],
          }),
          // 🚀 Campos fijos para evitar procesamiento
          quantity: 0,
          armed_cost: 0,
          variants: [],
          options: this.parseJsonField(variant.options),
          packs: [],
          sizes: [],
          tags: [],
          campaigns: [],
          reviews: null,
        }

        return processedVariant
      })

      this.logger.info(`✅ Variantes procesadas: ${variantsWithFilters.length}`)

      // 🔍 FILTRADO: Agrupar variantes con Size+Color y quedarse con la de menor ID
      this.logger.info(`🔍 Iniciando filtrado por Size+Color`)
      const filteredVariants = this.filterVariantsBySizeAndColor(variantsWithFilters)

      this.logger.info(
        `✅ Filtrado completado: ${variantsWithFilters.length} → ${filteredVariants.length} variantes`
      )
      return { data: filteredVariants, meta: paginated.getMeta() }
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
  /**
   * 🔧 Helper para parsear campos JSON de forma segura
   */
  private parseJsonField(field: any): any {
    if (!field) return field
    if (typeof field === 'string') {
      try {
        return JSON.parse(field)
      } catch {
        return field
      }
    }
    return field
  }

  /**
   *  Filtra variantes que tengan Size+Color O Solo Size, agrupando por product_id y quedándose con la de menor ID
   * @param variants - Array de variantes a filtrar
   * @returns Array filtrado de variantes
   */
  private filterVariantsBySizeAndColor(variants: any[]): any[] {
    try {
      const { selectedMap, variantsWithoutSize } = variants.reduce(
        (acc, variant) => {
          const hasSize = this.hasSizeOptions(variant.options)

          if (hasSize) {
            // 🎯 Agrupar por product_id y mantener solo la de menor ID
            const productId = variant.product_id

            // 🔧 Manejar casos donde product_id es undefined
            if (productId === undefined || productId === null) {
              // Si no tiene product_id, mantenerla directamente
              acc.variantsWithoutSize.push(variant)
            } else {
              // Agrupar por product_id normalmente
              if (!acc.selectedMap[productId] || variant.id < acc.selectedMap[productId].id) {
                acc.selectedMap[productId] = variant
              }
            }
          } else {
            // 📦 Variantes sin Size se mantienen todas
            acc.variantsWithoutSize.push(variant)
          }
          return acc
        },
        {
          selectedMap: {} as Record<number, any>,
          variantsWithoutSize: [] as any[],
        }
      )

      // Convertir el mapa a array de variantes seleccionadas
      const selectedVariantsArray = Object.values(selectedMap)

      // Combinar resultados finales
      const finalResult = [...selectedVariantsArray, ...variantsWithoutSize]

      this.logger.info(
        `🔍 Filtrado completado: ${variants.length} → ${finalResult.length} variantes`
      )

      return finalResult
    } catch (error) {
      this.logger.error('❌ Error filtrando variantes por Size+Color:', error)
      // En caso de error, devolver las variantes originales
      return variants
    }
  }

  /**
   * 🔍 Verifica si una variante tiene opciones de Size (con o sin Color)
   * @param options - Array de opciones de la variante
   * @returns true si tiene Size, false en caso contrario
   */
  private hasSizeOptions(options: any[]): boolean {
    if (!options || !Array.isArray(options) || options.length === 0) {
      return false
    }

    return options.some((option) => option.option_display_name === 'Size')
  }
}
