/**
 * Contrato para calculos de negocio (descuento, precio transferencia, peso volumetrico, stock).
 * La capa de aplicacion usa este port; infrastructure lo implementa con CalculationService.
 */
export interface CalculationPort {
  calculateDiscount(price: number, salePrice: number): string

  calculateTransferPrice(
    price: number,
    salePrice: number,
    transferPercent?: number
  ): number

  calculateVolumetricWeight(
    width: number,
    depth: number,
    height: number,
    weight: number,
    countryCode?: string
  ): number

  calculateAvailableStock(
    inventoryLevel: number,
    safetyStock?: number,
    availableToSell?: number
  ): number
}
