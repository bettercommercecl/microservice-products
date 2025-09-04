import env from '#start/env'
import axios from 'axios'
import Logger from '@adonisjs/core/services/logger'

class PriceService {
  async getPriceByVariantId(variant_id: number) {
    const logger = Logger.child({ service: 'PriceService' })
    try {
      logger.info(`💰 Obteniendo precio para variante ${variant_id}...`)

      const listPriceId = env.get(`LIST_PRICE_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_PRICES')}/price/${variant_id}/${listPriceId}`
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })

      logger.info(`✅ Precio obtenido para variante ${variant_id}: $${response.data?.price || 0}`)
      return response.data
    } catch (error) {
      logger.error(`❌ Error al obtener precio para variante ${variant_id}:`, error)
      throw error
    }
  }
}
export default PriceService
