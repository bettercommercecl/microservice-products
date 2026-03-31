import type { CalculationPort } from '#application/ports/calculation.port'
import type { BigCommerceProductVariant } from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type { FormattedVariantForModel } from '#interfaces/formatted_variant_for_model.interface'
import type { PriceListRecord } from '#infrastructure/bigcommerce/modules/pricelists/interfaces/pricelist_record.interface'
import type {
  FormattedProduct,
  FormattedProductWithVariants,
  PriceResult,
  StockData,
} from '#interfaces/product-sync/sync.interfaces'
import CatalogSafeStock from '#models/catalog_safe_stock'
import Category from '#models/category'
import type InventoryReserve from '#models/inventory_reserve'
import CategoryService from '#services/categories_service'
import ImageProcessingService from '#services/image_processing_service'
import ProductTagsCampaignsService from '#services/product_tags_campaigns_service'
import { priceResultFromBcPricelistRecord } from '#services/synchronizations/bc_pricelist_pricing'
import type { PricingStrategy } from '#services/synchronizations/pricing/product_pricing_strategy'
import { PricingStrategyFactory } from '#services/synchronizations/pricing/product_pricing_strategy'
import env from '#start/env'
import { parseEnvFloat } from '#utils/env_parser'
import Logger from '@adonisjs/core/services/logger'
import pLimit from 'p-limit'

/**
 * Formatea variantes de BigCommerce al esquema de la tabla variants.
 * Delega precios al PricingStrategy compartido con FormatProductsService.
 */
export interface FormatVariantsServiceDeps {
  calculation: CalculationPort
}

export default class FormatVariantsService {
  private readonly logger = Logger.child({ service: 'FormatVariantsService' })
  private readonly pricingStrategy: PricingStrategy
  private readonly calculation: CalculationPort
  private readonly imageProcessingService: ImageProcessingService
  private readonly percentDiscount: number
  private readonly productTagsCampaignsService: ProductTagsCampaignsService

  private static readonly DEFAULT_PERCENT_DISCOUNT = 2

  constructor(deps: FormatVariantsServiceDeps) {
    this.calculation = deps.calculation
    this.pricingStrategy = PricingStrategyFactory.create(deps.calculation)
    this.imageProcessingService = new ImageProcessingService()
    this.productTagsCampaignsService = new ProductTagsCampaignsService({
      categoryService: new CategoryService(),
    })
    this.percentDiscount =
      parseEnvFloat('PERCENT_DISCOUNT_TRANSFER_PRICE') ??
      FormatVariantsService.DEFAULT_PERCENT_DISCOUNT
  }

  async formatVariants(
    products: FormattedProduct[],
    reservesMap: Map<string, InventoryReserve>,
    options?: { bcPriceListByVariantId?: Map<number, PriceListRecord> }
  ): Promise<FormattedProductWithVariants[]> {
    // Keywords una vez por producto por lote (no por variante). Tags/campanas y posible batch
    const keywordLimit = pLimit(10)
    const keywordPairs = await Promise.all(
      products.map((product) =>
        keywordLimit(async () => {
          const keywords = await this.generateKeywords(product)
          return [product.id, keywords] as const
        })
      )
    )
    const keywordsByProductId = new Map<number, string>(keywordPairs)

    const allVariantIds = products.flatMap((p) =>
      (p._raw_variants as BigCommerceProductVariant[]).map((v) => v.id)
    )
    const inventoryMap = await this.batchLoadVariantInventory(allVariantIds)

    const allTasks = this.flattenVariantTasks(products)

    const limit = pLimit(10)
    const formattedVariants = await Promise.all(
      allTasks.map(({ variant, product }) =>
        limit(() =>
          this.buildFormattedVariant(
            variant,
            product,
            inventoryMap,
            reservesMap,
            keywordsByProductId.get(product.id) ?? '',
            options?.bcPriceListByVariantId
          )
        )
      )
    )

    return this.regroupByProduct(products, formattedVariants)
  }

  // ================================================================
  // CONSTRUCCION DE VARIANTE FORMATEADA
  // ================================================================

  private async resolveVariantPrices(
    variant: BigCommerceProductVariant,
    bcMap?: Map<number, PriceListRecord>
  ): Promise<PriceResult> {
    if (env.get('COUNTRY_CODE') === 'CL') {
      return this.pricingStrategy.getVariantPrices(variant, this.percentDiscount)
    }

    const record = bcMap?.get(variant.id)
    if (!record) {
      this.logger.warn({ variant_id: variant.id }, 'Sin registro de price list BC para variante')
      return PricingStrategyFactory.ZERO_PRICES
    }

    return priceResultFromBcPricelistRecord(record, this.calculation, this.percentDiscount)
  }

  private async buildFormattedVariant(
    variant: BigCommerceProductVariant,
    product: FormattedProduct,
    inventoryMap: Map<number, StockData>,
    reservesMap: Map<string, InventoryReserve>,
    keywords: string,
    bcPriceMap?: Map<number, PriceListRecord>
  ): Promise<FormattedVariantForModel> {
    const inventory = inventoryMap.get(variant.id) || { available_to_sell: 0, safety_stock: 0 }
    const prices = await this.resolveVariantPrices(variant, bcPriceMap)
    const reserve = reservesMap.get(variant.sku)
    const hasZeroPrices = prices.normal_price === 0 && prices.discount_price === 0

    const productImages = product.images ? JSON.parse(product.images) : []
    const images = this.imageProcessingService.getImagesByVariation(
      productImages,
      variant.sku,
      variant.image_url
    )
    const hoverImage = this.imageProcessingService.getHoverImageByVariation(
      productImages,
      variant.sku
    )
    const calculatedWeight = this.calculation.calculateVolumetricWeight(
      variant.width,
      variant.depth,
      variant.height,
      variant.weight ?? product.weight ?? 0,
      env.get('COUNTRY_CODE')
    )

    return {
      id: variant.id,
      product_id: product.id,
      title: product.title,
      sku: variant.sku,
      normal_price: prices.normal_price,
      discount_price: prices.discount_price,
      cash_price: prices.cash_price,
      discount_rate: prices.discount,
      stock: inventory.available_to_sell,
      warning_stock: inventory.safety_stock,
      image: variant.image_url || product.image,
      hover: hoverImage || null,
      images: JSON.stringify(images),
      categories: product.categories,
      quantity: variant.inventory_level,
      armed_cost: 0,
      armed_quantity: 1,
      weight: calculatedWeight,
      height: variant.height,
      depth: variant.depth,
      width: variant.width,
      type: 'variant',
      options: variant.option_values?.length ? JSON.stringify(variant.option_values) : null,
      related_products: product.related_products,
      option_label: variant.option_values?.[0]?.label || null,
      keywords,
      reserve: reserve?.fecha_reserva || null,
      is_visible: hasZeroPrices ? false : product.is_visible,
    }
  }

  // ================================================================
  // HELPERS INTERNOS
  // ================================================================

  private flattenVariantTasks(products: FormattedProduct[]) {
    const tasks: Array<{ variant: BigCommerceProductVariant; product: FormattedProduct }> = []

    for (const product of products) {
      for (const variant of product._raw_variants as BigCommerceProductVariant[]) {
        tasks.push({ variant, product })
      }
    }

    return tasks
  }

  /**
   * Reagrupa variantes formateadas de vuelta a sus productos correspondientes.
   * Mantiene el orden original de las variantes.
   */
  private regroupByProduct(
    products: FormattedProduct[],
    formattedVariants: FormattedVariantForModel[]
  ): FormattedProductWithVariants[] {
    const variantsByProduct = new Map<number, FormattedVariantForModel[]>()
    let idx = 0

    for (const product of products) {
      const variants: FormattedVariantForModel[] = []
      for (let i = 0; i < product._raw_variants.length; i++) {
        variants.push(formattedVariants[idx])
        idx++
      }
      variantsByProduct.set(product.id, variants)
    }

    return products.map((product) => {
      // Nombre del campo en FormattedProduct (snake_case por contrato)
      const { _raw_variants: rawVariants, ...productData } = product
      return {
        ...productData,
        variants: variantsByProduct.get(product.id) || [],
      }
    })
  }

  private async batchLoadVariantInventory(variantIds: number[]): Promise<Map<number, StockData>> {
    const map = new Map<number, StockData>()
    if (variantIds.length === 0) return map

    try {
      const rows = await CatalogSafeStock.query().whereIn('variant_id', variantIds)
      for (const row of rows) {
        const current = map.get(row.variant_id) || { available_to_sell: 0, safety_stock: 0 }
        current.available_to_sell += row.available_to_sell || 0
        current.safety_stock += row.safety_stock || 0
        map.set(row.variant_id, current)
      }
    } catch (error: any) {
      this.logger.warn({ error: error.message }, 'Error cargando inventario de variantes')
    }

    return map
  }

  /**
   * Genera keywords combinando títulos de categorías, tags y campañas del producto.
   */
  private async generateKeywords(product: FormattedProduct): Promise<string> {
    try {
      const { tags, campaigns } =
        await this.productTagsCampaignsService.getTagsAndCampaignsForProduct(product.id)

      let categoryTitles: string[] = []
      if (Array.isArray(product._raw_categories) && product._raw_categories.length > 0) {
        const categories = await Category.query()
          .whereIn('category_id', product._raw_categories)
          .select('title')
        categoryTitles = categories.map((c) => c.title)
      }

      const allKeywords = [...categoryTitles, ...tags, ...campaigns].filter(Boolean)
      return [...new Set(allKeywords)].join(', ')
    } catch (error: any) {
      this.logger.warn(
        { product_id: product.id, error: error.message },
        'Error generando keywords para producto'
      )
      return ''
    }
  }
}
