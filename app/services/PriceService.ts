import env from '#start/env'
import axios from 'axios'

class PriceService {
  static async getPriceByVariantId(variant_id : number) {
    try {
      const listPriceId = env.get(`LIST_PRICE_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_PRICES')}/price/${variant_id}/${listPriceId}`
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000
      })
      return response.data
    } catch (error) {
      console.error(error)
      throw error
    }
  }
}
export default PriceService
