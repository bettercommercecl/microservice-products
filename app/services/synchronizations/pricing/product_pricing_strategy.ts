import type { CalculationPort } from '#application/ports/calculation.port'
import type {
  BigCommerceProduct,
  BigCommerceProductVariant,
} from '#infrastructure/bigcommerce/modules/products/interfaces/bigcommerce_product.interface'
import type { PriceResult } from '#interfaces/product-sync/sync.interfaces'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import PriceService from '#services/price_service'

/**
 * Contrato para estrategias de calculo de precios.
 * Cada pais puede tener su propia fuente de precios y forma de calcular.
 */
export interface PricingStrategy {
  getProductPrices(product: BigCommerceProduct, percentDiscount: number): Promise<PriceResult>
  getVariantPrices(
    variant: BigCommerceProductVariant,
    percentDiscount: number
  ): Promise<PriceResult>
}

// ================================================================
// CHILE: precios directos desde BigCommerce (price / sale_price)
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
// CO / PE: precios desde PriceService (API externa por variant_id)
// ================================================================

export class InternationalPricingStrategy implements PricingStrategy {
  private readonly logger = Logger.child({ service: 'InternationalPricing' })
  constructor(
    private readonly calculation: CalculationPort,
    private readonly priceService: PriceService
  ) {}

  async getProductPrices(
    product: BigCommerceProduct,
    percentDiscount: number
  ): Promise<PriceResult> {
    const variants = product.variants || []
    if (variants.length === 0) return PricingStrategyFactory.ZERO_PRICES

    return this.fetchAndCalculate(variants[0].id, percentDiscount)
  }

  async getVariantPrices(
    variant: BigCommerceProductVariant,
    percentDiscount: number
  ): Promise<PriceResult> {
    return this.fetchAndCalculate(variant.id, percentDiscount)
  }

  private async fetchAndCalculate(
    variantId: number,
    percentDiscount: number
  ): Promise<PriceResult> {
    try {
      const prices = await this.priceService.getPriceByVariantId(variantId)
      if (!prices?.price || !prices?.calculatedPrice) {
        return PricingStrategyFactory.ZERO_PRICES
      }

      const discount = this.calculation.calculateDiscount(
        prices.price,
        prices.calculatedPrice
      )
      const cashPrice = this.calculation.calculateTransferPrice(
        prices.price,
        prices.calculatedPrice,
        percentDiscount
      )

      return {
        normal_price: prices.price,
        discount_price: prices.calculatedPrice,
        cash_price: cashPrice,
        discount,
      }
    } catch (error: any) {
      this.logger.warn({ variant_id: variantId, error: error.message }, 'Sin datos de precios')
      return PricingStrategyFactory.ZERO_PRICES
    }
  }
}

// ================================================================
// FACTORY: Resuelve la estrategia segun USE_EXTERNAL_PRICING
// Si el pais usa price list externo -> InternationalPricingStrategy
// Si no -> precios directos de BigCommerce (ClPricingStrategy)
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

    const useExternal = env.get('USE_EXTERNAL_PRICING', false)
    this.instance = useExternal
      ? new InternationalPricingStrategy(calculation, new PriceService())
      : new ClPricingStrategy(calculation)

    return this.instance
  }
}
