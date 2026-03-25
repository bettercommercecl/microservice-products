import type { CalculationPort } from '#application/ports/calculation.port'
import CalculationService from '#services/calculation_service'

/**
 * Implementacion del port de calculos; delega en CalculationService.
 */
export default class CalculationAdapter implements CalculationPort {
  private readonly calculationService: CalculationService

  constructor() {
    this.calculationService = new CalculationService()
  }

  calculateDiscount(price: number, salePrice: number): string {
    return this.calculationService.calculateDiscount(price, salePrice)
  }

  calculateTransferPrice(
    price: number,
    salePrice: number,
    transferPercent?: number
  ): number {
    return this.calculationService.calculateTransferPrice(
      price,
      salePrice,
      transferPercent
    )
  }

  calculateVolumetricWeight(
    width: number,
    depth: number,
    height: number,
    weight: number,
    countryCode?: string
  ): number {
    return this.calculationService.calculateVolumetricWeight(
      width,
      depth,
      height,
      weight,
      countryCode
    )
  }

  calculateAvailableStock(
    inventoryLevel: number,
    safetyStock?: number,
    availableToSell?: number
  ): number {
    return this.calculationService.calculateAvailableStock(
      inventoryLevel,
      safetyStock,
      availableToSell
    )
  }
}
