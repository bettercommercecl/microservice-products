import Logger from '@adonisjs/core/services/logger'

export default class CalculationService {
  private readonly logger = Logger.child({ service: 'PriceCalculationService' })

  /**
   * 💰 Calcula el porcentaje de descuento
   * @param price - Precio original
   * @param salePrice - Precio de venta
   * @returns Porcentaje de descuento como string
   */
  calculateDiscount(price: number, salePrice: number): string {
    try {
      if (price <= 0 || salePrice <= 0) {
        return '0%'
      }

      if (salePrice >= price) {
        return '0%'
      }

      const discountPercent = Math.round(((price - salePrice) / price) * 100)

      if (discountPercent >= 0 && discountPercent < 100) {
        return `${discountPercent}%`
      }

      return '0%'
    } catch (error) {
      this.logger.error('Error calculando descuento:', error)
      return '0%'
    }
  }

  /**
   * 💸 Calcula el precio de transferencia
   * @param price - Precio original
   * @param salePrice - Precio de venta
   * @param transferPercent - Porcentaje de descuento para transferencia
   * @returns Precio de transferencia
   */
  calculateTransferPrice(price: number, salePrice: number, transferPercent: number = 2): number {
    try {
      if (price <= 0 && salePrice <= 0) {
        return 0
      }

      const basePrice = salePrice > 0 ? salePrice : price
      const discountAmount = basePrice * (transferPercent / 100)
      const transferPrice = basePrice - discountAmount

      return Math.round(Math.max(0, transferPrice))
    } catch (error) {
      this.logger.error('Error calculando precio de transferencia:', error)
      return 0
    }
  }

  /**
   * Calcula el peso volumétrico
   * @param width - Ancho
   * @param depth - Profundidad
   * @param height - Alto
   * @param weight - Peso real
   * @param countryCode - Código del país
   * @returns Peso calculado
   */
  calculateVolumetricWeight(
    width: number,
    depth: number,
    height: number,
    weight: number,
    countryCode: string = 'CL'
  ): number {
    try {
      const volumetric = (width * depth * height) / 4000

      // Perú usa peso real, otros países usan el mayor entre volumétrico y real
      if (countryCode === 'PE') {
        return weight
      }

      return Math.max(volumetric, weight)
    } catch (error) {
      this.logger.error('Error calculando peso volumétrico:', error)
      return weight
    }
  }

  /**
   * Calcula el stock disponible
   * @param inventoryLevel - Nivel de inventario
   * @param safetyStock - Stock de seguridad
   * @param availableToSell - Disponible para venta
   * @returns Stock calculado
   */
  calculateAvailableStock(
    inventoryLevel: number,
    safetyStock: number = 0,
    availableToSell?: number
  ): number {
    try {
      if (availableToSell !== undefined) {
        return Math.max(0, availableToSell)
      }

      return Math.max(0, inventoryLevel - safetyStock)
    } catch (error) {
      this.logger.error('Error calculando stock disponible:', error)
      return 0
    }
  }
}
