import env from '#start/env'
import axios from 'axios'
import Logger from '@adonisjs/core/services/logger'

class InventoryService {
  static async getInventoryByVariantId(variant_id: number) {
    const logger = Logger.child({ service: 'InventoryService' })
    try {
      logger.info(`📦 Obteniendo inventario para variante ${variant_id}...`)

      const locationId = env.get(`INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_INVENTORY')}/inventory/${variant_id}/${locationId}`
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })

      logger.info(
        `✅ Inventario obtenido para variante ${variant_id}: ${response.data?.availableToSell || 0} unidades disponibles`
      )
      return response.data
    } catch (error) {
      logger.error(`❌ Error al obtener inventario para variante ${variant_id}:`, error)
      throw error
    }
  }

  static async updateInventory(product_id: number, quantity: number) {
    const logger = Logger.child({ service: 'InventoryService' })
    try {
      logger.info(
        `🔄 Actualizando inventario para producto ${product_id} con cantidad ${quantity}...`
      )

      const locationId = env.get(`INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_INVENTORY')}/inventory/${product_id}/${locationId}/${quantity}`
      const response = await axios.patch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })

      logger.info(`✅ Inventario actualizado para producto ${product_id}: ${quantity} unidades`)
      return response.data
    } catch (error) {
      logger.error(`❌ Error al actualizar inventario para producto ${product_id}:`, error)
      throw error
    }
  }
}
export default InventoryService
