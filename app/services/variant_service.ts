import { formatVariantForMarcas } from '#application/formatters/variants_by_channel_formatter'
import type { CalculationPort } from '#application/ports/calculation.port'
import type { VariantRepositoryPort } from '#application/ports/variant_repository.port'
import {
  toInventoryForFormatDTO,
  toReserveForFormatDTO,
  toVariantForFormatDTO,
} from '#infrastructure/mappers/variant_format.mapper'
import CatalogSafeStock from '#models/catalog_safe_stock'
import FiltersProduct from '#models/filters_product'
import InventoryReserve from '#models/inventory_reserve'
import Product from '#models/product'
import Variant from '#models/variant'
import ProductTagsCampaignsService from '#services/product_tags_campaigns_service'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'

export interface VariantServiceDeps {
  productTagsCampaignsService: ProductTagsCampaignsService
  calculation: CalculationPort
  variantRepository: VariantRepositoryPort
}

export default class VariantService {
  private readonly logger = Logger.child({ service: 'VariantService' })
  private readonly productTagsCampaignsService: ProductTagsCampaignsService
  private readonly calculation: CalculationPort
  private readonly variantRepository: VariantRepositoryPort

  constructor(deps: VariantServiceDeps) {
    this.productTagsCampaignsService = deps.productTagsCampaignsService
    this.calculation = deps.calculation
    this.variantRepository = deps.variantRepository
  }

  /**
   * Obtiene todas las variantes (usa replica de lectura si esta configurada).
   */
  async getAllVariants() {
    try {
      const variants = await this.variantRepository.findAll()
      return {
        success: true,
        data: variants,
      }
    } catch (error) {
      this.logger.error('Error obteniendo variantes', { error: error.message })
      throw new Error(
        `Error al obtener variantes: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  public async formatVariants(variants?: Variant[]) {
    try {
      if (variants) {
        const formattedVariants = await Promise.all(
          variants.map(async (variant) => {
            const product = await Product.query()
              .where('id', variant.product_id)
              .preload('categoryProducts')
              .preload('brand')
              .first()
            const variantCategories = product?.categoryProducts
              ? product.categoryProducts.map((catProd: any) => catProd.category_id)
              : []

            let tags: string[] = []
            let campaigns: string[] = []
            if (product) {
              const { tags: t, campaigns: c } =
                await this.productTagsCampaignsService.getTagsAndCampaignsForProduct(product.id)
              tags = t
              campaigns = c
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
            //     this.logger.warn(`Error parseando reviews para producto ${product.id}:`, error)
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
              categories: variantCategories, // Ya viene parseado del modelo
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
      this.logger.error('Error formateando variantes', { error: error.message })
      throw error
    }
  }

  public async getVariantsByIds(ids: number[]) {
    try {
      const variants = await this.variantRepository.findByIds(ids)
      return {
        success: true,
        data: variants,
      }
    } catch (error) {
      this.logger.error('Error obteniendo variantes por IDs', { ids, error: error.message })
      throw new Error(
        `Error al obtener variantes por IDs: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  /**
   * Variantes paginadas con estructura de tabla (columnas tal cual), timestamps en ISO.
   * Para GET desde marcas y persistir sin transformar.
   */
  async getVariantsPaginatedTableShape(
    page: number,
    limit: number,
    channelId?: number
  ): Promise<{
    data: Record<string, unknown>[]
    meta: { total: number; perPage: number; currentPage: number; lastPage: number }
  }> {
    return this.variantRepository.findPaginatedTableShape(page, limit, channelId)
  }

  /**
   * Variantes por canal en formato marcas (id, sku, type, image, stock, main_title, precios, reserve, etc.).
   */
  async getVariantsByChannelForMarcas(
    channelId: number,
    page: number,
    limit: number,
    parentCategoryId?: number
  ): Promise<{
    data: unknown[]
    meta: { total: number; perPage: number; currentPage: number; lastPage: number }
  }> {
    const { data: variants, meta } = await this.variantRepository.findPaginatedByChannelWithProduct(
      channelId,
      page,
      limit,
      parentCategoryId
    )
    if (variants.length === 0) {
      return { data: [], meta }
    }

    const variantIds = (variants as { id: number }[]).map((v) => v.id)
    const skus = (variants as { sku?: string }[])
      .map((v) => v.sku)
      .filter((s): s is string => typeof s === 'string' && s.length > 0)

    const [inventoryRows, reserveRows] = await Promise.all([
      CatalogSafeStock.query().whereIn('variant_id', variantIds),
      skus.length > 0 ? InventoryReserve.query().whereIn('sku', skus) : [],
    ])

    const inventoryByVariantId = new Map<number, CatalogSafeStock>()
    for (const row of inventoryRows) {
      inventoryByVariantId.set(row.variant_id, row)
    }
    const reserveBySku = new Map<string, InventoryReserve>()
    for (const row of reserveRows) {
      reserveBySku.set(row.sku, row)
    }

    const formatOptions = {
      percentTransfer: Number(env.get('PERCENT_DISCOUNT_TRANSFER_PRICE')) || 2,
    }
    const data = (variants as Variant[]).map((v) =>
      formatVariantForMarcas(
        toVariantForFormatDTO(v),
        toInventoryForFormatDTO(inventoryByVariantId.get(v.id) ?? null),
        toReserveForFormatDTO(reserveBySku.get(v.sku) ?? null),
        this.calculation,
        formatOptions
      )
    )
    return { data, meta }
  }

  public async getAllVariantsPaginated(
    page = 1,
    limit = 100,
    channelId?: number,
    _options?: { parentCategoryId?: number }
  ) {
    try {
      let paginated: any
      let productIds: number[] = []

      if (channelId) {
        paginated = await Variant.query()
          .join('channel_product', 'variants.product_id', 'channel_product.product_id')
          .where('channel_product.channel_id', channelId)
          .join('products', 'variants.product_id', 'products.id')
          .where('variants.is_visible', '=', true)
          .where('products.is_visible', '=', true)
          .select('variants.*')
          .paginate(page, limit)

        productIds = paginated.all().map((variant: any) => variant.product_id)
      } else {
        paginated = await Variant.query()
          .join('products', 'variants.product_id', 'products.id')
          .where('variants.is_visible', '=', true)
          .where('products.is_visible', '=', true)
          .select('variants.*')
          .paginate(page, limit)
        productIds = paginated.all().map((variant: any) => variant.product_id)
      }

      // Obtener filtros de productos
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

      const uniqueProductIds = [...new Set(productIds)]
      const tagsCampaignsMap =
        await this.productTagsCampaignsService.getTagsAndCampaignsForProducts(uniqueProductIds)

      const variantRows = paginated.all() as Variant[]
      const skusForReserve = variantRows
        .map((v) => (typeof v.sku === 'string' ? v.sku.trim() : ''))
        .filter((s) => s.length > 0)
      const reserveRows =
        skusForReserve.length > 0
          ? await InventoryReserve.query().whereIn('sku', skusForReserve)
          : []
      const reserveFechaBySku = new Map<string, string | null>()
      for (const row of reserveRows) {
        reserveFechaBySku.set(row.sku.trim(), row.fecha_reserva)
      }

      // Cargar datos de productos
      const productsMap = new Map<number, any>()

      if (uniqueProductIds.length > 0) {
        const products = await Product.query()
          .whereIn('id', uniqueProductIds)
          .preload('categoryProducts')
          .preload('brand')

        products.forEach((product) => {
          productsMap.set(product.id, product)
        })
      }

      // Obtener el ID de reserva según el país
      const ID_RESERVE =
        env.get('COUNTRY_CODE') === 'CL' ? 1487 : env.get('COUNTRY_CODE') === 'CO' ? 3053 : 1472
      // Procesar variantes
      let variantsWithFilters = paginated.all().map((variant: any) => {
        const filters = filtersMap.get(variant.product_id) || []
        const product = productsMap.get(variant.product_id)
        let tags = tagsCampaignsMap.get(variant.product_id)?.tags ?? []
        let campaigns = tagsCampaignsMap.get(variant.product_id)?.campaigns ?? []

        // Si el producto tiene categorías de reserva, filtrar tags y campaigns que contengan "mañana"
        if (product?.categoryProducts?.some((cp: any) => cp.category_id === ID_RESERVE)) {
          tags = tags.filter((tag: string) => !tag.toLowerCase().includes('mañana'))
          campaigns = campaigns.filter(
            (campaign: string) => !campaign.toLowerCase().includes('mañana')
          )
        }

        const skuKey = typeof variant.sku === 'string' ? variant.sku.trim() : ''
        const reserveFromInventory = skuKey ? reserveFechaBySku.get(skuKey)?.trim() || null : null

        const processedVariant = {
          id: variant.id,
          product_id: variant.product_id,
          image: variant.image,
          images: this.parseJsonField(variant.images),
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
          filters,
          ...(product && {
            hover: product.hover,
            description: product.description,
            brand_id: product.brand_id,
            url: product.url,
            type: product.type,
            weight: product.weight,
            sort_order: product.sort_order,
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
          quantity: 0,
          armed_cost: 0,
          variants: [],
          options: this.parseJsonField(variant.options),
          packs: [],
          sizes: [],
          tags: tags.length > 0 ? [...new Set(tags)] : [],
          campaigns: campaigns.length > 0 ? [...new Set(campaigns)] : [],
          reviews: null,
          reserve:
            reserveFromInventory && reserveFromInventory !== '' ? reserveFromInventory : null,
        }

        return processedVariant
      })

      // parent_category: desactivado a propósito. El vínculo producto–canal ya lo define channel_product;
      // volver a filtrar por la categoría padre en category_products quitaba del listado productos que sí
      // pertenecen al canal cuando la taxonomía local no repetía esa categoría en category_products.
      // const parentCategoryId = options?.parentCategoryId
      // if (parentCategoryId) {
      //   const allowedProductIds = new Set<number>()
      //   for (const [productId, product] of productsMap.entries()) {
      //     const hasParentCategory =
      //       product?.categoryProducts?.some((cp: any) => cp.category_id === parentCategoryId) ?? false
      //     if (hasParentCategory) {
      //       allowedProductIds.add(productId)
      //     }
      //   }
      //   if (allowedProductIds.size > 0) {
      //     variantsWithFilters = variantsWithFilters.filter((variant: any) =>
      //       allowedProductIds.has(variant.product_id)
      //     )
      //   } else {
      //     variantsWithFilters = []
      //   }
      // }

      const filteredVariants = this.filterVariantsBySizeAndColor(variantsWithFilters)
      return { data: filteredVariants, meta: paginated.getMeta() }
    } catch (error) {
      this.logger.error('Error obteniendo variantes paginadas', {
        page,
        limit,
        channelId,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Helper para parsear campos JSON de forma segura
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

  /** Stock numerico para comparar variantes del mismo producto (NaN/null -> 0). */
  private numericStockForFilter(variant: { stock?: unknown }): number {
    const n = Number(variant?.stock)
    return Number.isFinite(n) ? n : 0
  }

  /**
   * Filtra variantes por Size+Color, agrupando por product_id: una variante por producto,
   * la de mayor stock (empate: menor id).
   */
  private filterVariantsBySizeAndColor(variants: any[]): any[] {
    try {
      const { selectedMap, variantsWithoutSize } = variants.reduce(
        (acc, variant) => {
          const hasSize = this.hasSizeOptions(variant.options)

          if (hasSize) {
            const productId = variant.product_id

            if (productId === undefined || productId === null) {
              acc.variantsWithoutSize.push(variant)
            } else {
              const prev = acc.selectedMap[productId]
              if (!prev) {
                acc.selectedMap[productId] = variant
              } else {
                const stockNew = this.numericStockForFilter(variant)
                const stockPrev = this.numericStockForFilter(prev)
                if (stockNew > stockPrev || (stockNew === stockPrev && variant.id < prev.id)) {
                  acc.selectedMap[productId] = variant
                }
              }
            }
          } else {
            acc.variantsWithoutSize.push(variant)
          }
          return acc
        },
        {
          selectedMap: {} as Record<number, any>,
          variantsWithoutSize: [] as any[],
        }
      )

      const selectedVariantsArray = Object.values(selectedMap)
      const finalResult = [...selectedVariantsArray, ...variantsWithoutSize]

      return finalResult
    } catch (error) {
      this.logger.error('Error filtrando variantes por Size+Color', error)
      return variants
    }
  }

  /**
   * Verifica si una variante tiene opciones de Size
   */
  private hasSizeOptions(options: any[]): boolean {
    if (!options || !Array.isArray(options) || options.length === 0) {
      return false
    }

    return options.some((option) => option.option_display_name === 'Size')
  }
}
