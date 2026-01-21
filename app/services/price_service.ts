import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import axios, { AxiosError } from 'axios'

class PriceService {
  private readonly logger = Logger.child({ service: 'PriceService' })
  private readonly MAX_RETRIES = 3
  private readonly INITIAL_TIMEOUT = 20000
  private readonly MAX_TIMEOUT = 30000

  async getPriceByVariantId(variant_id: number, retryCount = 0): Promise<any> {
    try {
      const listPriceId = env.get(`LIST_PRICE_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_PRICES')}/price/${variant_id}/${listPriceId}`

      // Timeout progresivo: aumenta con cada reintento
      const timeout = Math.min(this.INITIAL_TIMEOUT + retryCount * 5000, this.MAX_TIMEOUT)

      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout,
      })

      return response.data
    } catch (error) {
      const axiosError = error as AxiosError
      const isTimeout = axiosError.code === 'ECONNABORTED' || axiosError.message.includes('timeout')
      const isRetryable = isTimeout || (axiosError.response?.status || 0) >= 500

      // Reintentar solo si es un error recuperable y no hemos excedido el máximo de reintentos
      if (isRetryable && retryCount < this.MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000 // Backoff exponencial: 1s, 2s, 4s

        this.logger.warn(
          {
            variant_id,
            retryCount: retryCount + 1,
            maxRetries: this.MAX_RETRIES,
            delay,
            error: axiosError.message,
            status: axiosError.response?.status,
          },
          'Error obteniendo precio por variante, reintentando'
        )

        await this.sleep(delay)
        return this.getPriceByVariantId(variant_id, retryCount + 1)
      }

      // Si no es recuperable o hemos excedido los reintentos, logear y lanzar error
      this.logger.error(
        {
          variant_id,
          retryCount,
          error: axiosError.message,
          status: axiosError.response?.status,
          isTimeout,
          isRetryable,
        },
        'Error obteniendo precio por variante'
      )
      throw error
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
export default PriceService
