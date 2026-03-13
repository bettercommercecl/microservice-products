import type { BigCommerceProductVariant } from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type { FormattedVariantForModel } from '#interfaces/formatted_variant_for_model.interface'
import type InventoryReserve from '#models/inventory_reserve'
import type { FormattedProduct, FormattedProductWithVariants, StockData } from '#interfaces/product-sync/sync.interfaces'
import CatalogSafeStock from '#models/catalog.safe.stock'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import pLimit from 'p-limit'
import { parseEnvFloat } from '#utils/env_parser'
import type { PricingStrategy } from './pricing/product_pricing_strategy.js'
import { PricingStrategyFactory } from './pricing/product_pricing_strategy.js'
import CalculationService from '../calculation_service.js'
import ImageProcessingService from '../image_processing_service.js'

/**
 * Formatea variantes de BigCommerce al esquema de la tabla variants.
 * Delega precios al PricingStrategy compartido con FormatProductsService.
 */
export default class FormatVariantsService {
  private readonly logger = Logger.child({ service: 'FormatVariantsService' })
  private readonly country = env.get('COUNTRY_CODE')
  private readonly pricingStrategy: PricingStrategy
  private readonly calculationService: CalculationService
  private readonly imageProcessingService: ImageProcessingService
  private readonly percentDiscount: number

  private static readonly DEFAULT_PERCENT_DISCOUNT = 2

  constructor() {
    this.pricingStrategy = PricingStrategyFactory.create()
    this.calculationService = new CalculationService()
    this.imageProcessingService = new ImageProcessingService()
    this.percentDiscount =
      parseEnvFloat('PERCENT_DISCOUNT_TRANSFER_PRICE') ??
      FormatVariantsService.DEFAULT_PERCENT_DISCOUNT
  }

  async formatVariants(
    products: FormattedProduct[],
    reservesMap: Map<string, InventoryReserve>
  ): Promise<FormattedProductWithVariants[]> {
    const allVariantIds = products.flatMap((p) =>
      (p._raw_variants as BigCommerceProductVariant[]).map((v) => v.id)
    )
    const inventoryMap = await this.batchLoadVariantInventory(allVariantIds)

    const allTasks = this.flattenVariantTasks(products)

    const limit = pLimit(10)
    const formattedVariants = await Promise.all(
      allTasks.map(({ variant, product }) =>
        limit(() => this.buildFormattedVariant(variant, product, inventoryMap, reservesMap))
      )
    )

    return this.regroupByProduct(products, formattedVariants)
  }

  // ================================================================
  // CONSTRUCCION DE VARIANTE FORMATEADA
  // ================================================================

  private async buildFormattedVariant(
    variant: BigCommerceProductVariant,
    product: FormattedProduct,
    inventoryMap: Map<number, StockData>,
    reservesMap: Map<string, InventoryReserve>
  ): Promise<FormattedVariantForModel> {
    const inventory = inventoryMap.get(variant.id) || { available_to_sell: 0, safety_stock: 0 }
    const prices = await this.pricingStrategy.getVariantPrices(variant, this.percentDiscount)
    const reserve = reservesMap.get(variant.sku)
    const hasZeroPrices = prices.normal_price === 0 && prices.discount_price === 0

    const productImages = product.images ? JSON.parse(product.images) : []
    const images = this.imageProcessingService.getImagesByVariation(
      productImages, variant.sku, variant.image_url
    )
    const hoverImage = this.imageProcessingService.getHoverImageByVariation(
      productImages, variant.sku
    )
    const calculatedWeight = this.calculationService.calculateVolumetricWeight(
      variant.width, variant.depth, variant.height,
      variant.weight ?? product.weight ?? 0,
      this.country
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
      keywords: '',
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
      const { _raw_variants, ...productData } = product
      return {
        ...productData,
        variants: variantsByProduct.get(product.id) || [],
      }
    })
  }

  private async batchLoadVariantInventory(
    variantIds: number[]
  ): Promise<Map<number, StockData>> {
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
}
