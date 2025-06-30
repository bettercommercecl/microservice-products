import env from '#start/env'
import axios from 'axios'

class InventoryService {
  static async getInventoryByVariantId(variant_id : number) {
    try {
      const locationId = env.get(`INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_INVENTORY')}/inventory/${variant_id}/${locationId}`
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        }
      })
      return response.data

    } catch (error) {
      console.error(error)
      throw error
    }
  }

  static async updateInventory(product_id : number, quantity : number) {
    try {
      const locationId = env.get(`INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_INVENTORY')}/inventory/${product_id}/${locationId}/${quantity}`
      const response = await axios.patch(url, {
        headers: {
          'Content-Type': 'application/json',
        }
      })
      return response.data

    } catch (error) {
      console.error(error)
      throw error
    }
  }

}
export default InventoryService
