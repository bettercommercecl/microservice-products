import { getSizesByProduct } from '#application/formatters/get_sizes_by_product'
import type { CalculationPort } from '#application/ports/calculation.port'
import { getSizesConfig } from '#config/sizes_config'
import type {
  BigCommerceProduct,
  BigCommerceProductImage,
} from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type {
  FormattedProduct,
  ReviewData,
  StockData,
  TimerData,
} from '#interfaces/product-sync/sync.interfaces'
import CatalogSafeStock from '#models/catalog_safe_stock'
import type InventoryReserve from '#models/inventory_reserve'
import type { PricingStrategy } from '#services/synchronizations/pricing/product_pricing_strategy'
import { PricingStrategyFactory } from '#services/synchronizations/pricing/product_pricing_strategy'
import env from '#start/env'
import { parseEnvFloat, parseEnvInt } from '#utils/env_parser'
import Logger from '@adonisjs/core/services/logger'

interface SpecialCategoryIds {
  sameday: number | null
  despacho24horas: number | null
  pickupInStore: number | null
  freeShipping: number | null
  turbo: number | null
  nextday: number | null
}

/**
 * Formatea productos de BigCommerce al esquema de la tabla products.
 * Delega precios al PricingStrategy (OCP), recibe datos pre-cargados.
 */
export interface GlobalFormatProductsServiceDeps {
  calculation: CalculationPort
}

export default class GlobalFormatProductsService {
  private readonly logger = Logger.child({ service: 'GlobalFormatProductsService' })

  private readonly pricingStrategy: PricingStrategy
  private readonly specialCategoryIds: SpecialCategoryIds
  private readonly idReserve: number | null
  private readonly percentDiscount: number

  private static readonly DEFAULT_PERCENT_DISCOUNT = 2

  constructor(deps: GlobalFormatProductsServiceDeps) {
    this.pricingStrategy = PricingStrategyFactory.create(deps.calculation)
    this.specialCategoryIds = {
      sameday: parseEnvInt('ID_SAMEDAY'),
      despacho24horas: parseEnvInt('ID_24HORAS'),
      pickupInStore: parseEnvInt('ID_PICKUP_IN_STORE'),
      freeShipping: parseEnvInt('ID_FREE_SHIPPING'),
      turbo: parseEnvInt('ID_TURBO'),
      nextday: parseEnvInt('ID_NEXTDAY'),
    }
    this.idReserve = parseEnvInt('ID_RESERVE')
    this.percentDiscount =
      parseEnvFloat('PERCENT_DISCOUNT_TRANSFER_PRICE') ??
      GlobalFormatProductsService.DEFAULT_PERCENT_DISCOUNT
  }

  async formatProducts(
    products: BigCommerceProduct[],
    reservesMap: Map<string, InventoryReserve>,
    reviewsMap: Map<number, ReviewData>,
    timerMap: Map<number, TimerData>
  ): Promise<FormattedProduct[]> {
    const productIds = products.map((p) => p.id)
    const inventoryMap = await this.batchLoadInventory(productIds)

    return Promise.all(
      products.map((product) =>
        this.buildFormattedProduct(product, inventoryMap, reservesMap, reviewsMap, timerMap)
      )
    )
  }

  // ================================================================
  // CONSTRUCCION DEL PRODUCTO FORMATEADO
  // ================================================================

  private async buildFormattedProduct(
    product: BigCommerceProduct,
    inventoryMap: Map<number, StockData>,
    reservesMap: Map<string, InventoryReserve>,
    reviewsMap: Map<number, ReviewData>,
    timerMap: Map<number, TimerData>
  ): Promise<FormattedProduct> {
    const inventory = inventoryMap.get(product.id) || { available_to_sell: 0, safety_stock: 0 }
    const prices = await this.pricingStrategy.getProductPrices(product, this.percentDiscount)
    const images = product.images || []
    const variants = product.variants || []
    const channels = product.channels || []
    const quantity = variants.reduce((acc, v) => acc + v.inventory_level, 0)

    const hasZeroPrices = prices.normal_price === 0 && prices.discount_price === 0

    return {
      ...this.buildIdentity(product, variants),
      ...this.buildVisuals(images),
      ...this.buildStock(inventory, quantity),
      normal_price: prices.normal_price,
      discount_price: prices.discount_price,
      cash_price: prices.cash_price,
      percent: prices.discount,
      reserve: reservesMap.get(product.sku)?.fecha_reserva || '',
      reviews: this.serializeReview(reviewsMap.get(product.id)),
      ...this.buildCategoryFlags(product.categories),
      featured: product.is_featured,
      is_visible: hasZeroPrices ? false : product.is_visible,
      ...this.buildMetadata(product),
      ...this.buildTimerData(timerMap.get(product.id)),
      sizes: this.serializeSizes(product.categories),
      _channels: channels,
      _raw_categories: product.categories,
      _raw_variants: variants,
    }
  }

  private buildIdentity(product: BigCommerceProduct, variants: any[]) {
    return {
      id: product.id,
      product_id: product.id,
      title: product.name,
      page_title: product.page_title || product.name,
      description: product.description,
      type: (variants.length > 1 ? 'variation' : 'product') as 'product' | 'variation',
      brand_id: product.brand_id || null,
      categories: JSON.stringify(product.categories),
      url: product.custom_url?.url ?? '/',
    }
  }

  private buildVisuals(images: BigCommerceProductImage[]) {
    return {
      image: images.find((img) => img.is_thumbnail)?.url_standard || '',
      images: images.length > 0 ? JSON.stringify(images) : null,
      hover:
        images.find((img) => img.description?.toLowerCase().includes('hover'))?.url_standard || '',
    }
  }

  private buildStock(inventory: StockData, variantQuantity: number) {
    const useInventoryQuantity = env.get('USE_INVENTORY_QUANTITY', false)
    return {
      stock: inventory.available_to_sell,
      warning_stock: inventory.safety_stock,
      quantity: useInventoryQuantity ? inventory.available_to_sell : variantQuantity,
    }
  }

  private buildCategoryFlags(categories: number[]) {
    const has = (id: number | null) => (id !== null ? categories.includes(id) : false)
    const nextday =
      this.specialCategoryIds.nextday !== null &&
      this.idReserve !== null &&
      !categories.includes(this.idReserve) &&
      categories.includes(this.specialCategoryIds.nextday)

    return {
      sameday: has(this.specialCategoryIds.sameday),
      free_shipping: has(this.specialCategoryIds.freeShipping),
      despacho24horas: has(this.specialCategoryIds.despacho24horas),
      pickup_in_store: has(this.specialCategoryIds.pickupInStore),
      nextday,
      turbo: has(this.specialCategoryIds.turbo),
    }
  }

  private buildMetadata(product: BigCommerceProduct) {
    return {
      meta_description: product.meta_description || product.description?.substring(0, 160) || '',
      meta_keywords: product.meta_keywords?.length ? JSON.stringify(product.meta_keywords) : null,
      sort_order: product.sort_order || 0,
      total_sold: product.total_sold || 0,
      weight: product.weight || 0,
      armed_cost: 0,
      related_products: product.related_products?.length
        ? JSON.stringify(product.related_products)
        : null,
    }
  }

  private buildTimerData(timer?: TimerData) {
    return {
      timer_status: timer?.timer_status || false,
      timer_price: timer?.timer_price || 0,
      timer_datetime: timer?.timer_datetime || null,
    }
  }

  // ================================================================
  // SERIALIZACION Y LOOKUPS
  // ================================================================

  private serializeReview(review?: ReviewData): string | null {
    return review ? JSON.stringify(review) : null
  }

  private serializeSizes(categories: number[]): string {
    return JSON.stringify(getSizesByProduct(categories, getSizesConfig()))
  }

  private async batchLoadInventory(productIds: number[]): Promise<Map<number, StockData>> {
    const map = new Map<number, StockData>()
    if (productIds.length === 0) return map

    try {
      const rows = await CatalogSafeStock.query().whereIn('product_id', productIds)
      for (const row of rows) {
        const current = map.get(row.product_id) || { available_to_sell: 0, safety_stock: 0 }
        current.available_to_sell += row.available_to_sell || 0
        current.safety_stock += row.safety_stock || 0
        map.set(row.product_id, current)
      }
    } catch (error: any) {
      this.logger.warn({ error: error.message }, 'Error cargando inventario en batch')
    }

    return map
  }
}
