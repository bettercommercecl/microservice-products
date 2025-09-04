import env from '#start/env'
import axios from 'axios'
import Logger from '@adonisjs/core/services/logger'

class PriceService {
  private readonly logger = Logger.child({ service: 'PriceService' })

  async getPriceByVariantId(variant_id: number) {
    try {
      const listPriceId = env.get(`LIST_PRICE_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_PRICES')}/price/${variant_id}/${listPriceId}`
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })

      return response.data
    } catch (error) {
      this.logger.error('❌ Error obteniendo precio por variante', {
        variant_id,
        error: error.message,
      })
      throw error
    }
  }
}
export default PriceService
