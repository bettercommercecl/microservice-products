import type { CalculationPort } from '#application/ports/calculation.port'
import type {
  BigCommerceProduct,
  BigCommerceProductVariant,
} from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type { PriceResult } from '#interfaces/product-sync/sync.interfaces'

/**
 * Contrato para calculo de precios desde el payload de producto/variante de BigCommerce (Chile).
 * Paises distintos de CL usan el price list de BC cargado por lote (ver bc_pricelist_pricing y PricelistRecordsBatchService).
 */
export interface PricingStrategy {
  getProductPrices(product: BigCommerceProduct, percentDiscount: number): Promise<PriceResult>
  getVariantPrices(
    variant: BigCommerceProductVariant,
    percentDiscount: number
  ): Promise<PriceResult>
}

// ================================================================
// CHILE: precios directos desde BigCommerce (price / sale_price en el payload)
// ================================================================

export class ClPricingStrategy implements PricingStrategy {
  constructor(private readonly calculation: CalculationPort) {}

  async getProductPrices(
    product: BigCommerceProduct,
    percentDiscount: number
  ): Promise<PriceResult> {
    const discount = this.calculation.calculateDiscount(product.price, product.sale_price)
    const cashPrice = this.calculation.calculateTransferPrice(
      product.price,
      product.sale_price,
      percentDiscount
    )

    return {
      normal_price: product.price,
      discount_price: product.sale_price,
      cash_price: cashPrice,
      discount,
    }
  }

  async getVariantPrices(
    variant: BigCommerceProductVariant,
    percentDiscount: number
  ): Promise<PriceResult> {
    const salePrice = variant.sale_price || variant.calculated_price
    const discount = this.calculation.calculateDiscount(variant.price, salePrice)
    const cashPrice = this.calculation.calculateTransferPrice(
      variant.price,
      salePrice,
      percentDiscount
    )

    return {
      normal_price: variant.price,
      discount_price: salePrice,
      cash_price: cashPrice,
      discount,
    }
  }
}

// ================================================================
// FACTORY: siempre estrategia Chile (payload BC). Otros paises usan mapa de price list por lote.
// ================================================================

export class PricingStrategyFactory {
  static readonly ZERO_PRICES: PriceResult = {
    normal_price: 0,
    discount_price: 0,
    cash_price: 0,
    discount: '0%',
  }

  private static instance: PricingStrategy | null = null

  static create(calculation: CalculationPort): PricingStrategy {
    if (this.instance) return this.instance

    this.instance = new ClPricingStrategy(calculation)

    return this.instance
  }
}
