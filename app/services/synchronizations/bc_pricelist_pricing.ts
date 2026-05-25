import type { CalculationPort } from '#application/ports/calculation.port'
import type { PriceListRecord } from '#infrastructure/bigcommerce/modules/pricelists/interfaces/pricelist_record.interface'
import type { PriceResult } from '#interfaces/product-sync/sync.interfaces'
import { PricingStrategyFactory } from '#services/synchronizations/pricing/product_pricing_strategy'

/**
 * Convierte un registro del price list de BigCommerce al PriceResult usado en sync.
 * Alineado con la logica previa del microservicio de precios (price + calculatedPrice).
 */
export function priceResultFromBcPricelistRecord(
  record: PriceListRecord,
  calculation: CalculationPort,
  percentDiscount: number
): PriceResult {
  const price = record.price ?? 0
  const salePrice =
    record.calculated_price !== undefined && record.calculated_price !== null
      ? record.calculated_price
      : (record.sale_price ?? price)

  const discount = calculation.calculateDiscount(price, salePrice)
  const cashPrice = calculation.calculateTransferPrice(price, salePrice, percentDiscount)

  return {
    normal_price: price,
    discount_price: salePrice,
    cash_price: cashPrice,
    discount,
  }
}

/**
 * Resuelve precios de producto (nivel producto) usando la primera variante del mapa BC.
 */
export function productPriceResultFromBcMap(
  firstVariantId: number | undefined,
  bcMap: Map<number, PriceListRecord> | undefined,
  calculation: CalculationPort,
  percentDiscount: number
): PriceResult {
  if (!firstVariantId || !bcMap) {
    return PricingStrategyFactory.ZERO_PRICES
  }
  const record = bcMap.get(firstVariantId)
  if (!record) {
    return PricingStrategyFactory.ZERO_PRICES
  }
  return priceResultFromBcPricelistRecord(record, calculation, percentDiscount)
}
