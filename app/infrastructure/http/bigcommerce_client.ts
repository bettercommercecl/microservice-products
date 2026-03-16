import BigcommerceRateLimitInterceptor from '#infrastructure/interceptors/bigcommerce_rate_limit_interceptor'
import env from '#start/env'
import axios, { type AxiosInstance } from 'axios'
import http from 'node:http'
import https from 'node:https'

const axiosCreate = (axios as unknown as { create: (config?: object) => AxiosInstance }).create
let client: AxiosInstance | null = null

/**
 * Cliente HTTP dedicado a BigCommerce con keepAlive para reutilizar conexiones TLS
 * Incluye interceptor de rate limit integrado.
 */
export function getBigcommerceClient(): AxiosInstance {
  if (!client) {
    const storeHash = env.get('BIGCOMMERCE_API_STORE_ID') || ''
    const baseURL = `${env.get('BIGCOMMERCE_API_URL') || ''}${storeHash}`

    const instance = axiosCreate({
      baseURL,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Auth-Token': env.get('BIGCOMMERCE_API_TOKEN') || '',
        'host': 'api.bigcommerce.com',
      },
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 25 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 25 }),
    })

    BigcommerceRateLimitInterceptor.getInstance().setup(instance)
    client = instance
  }

  return client
}

/**
 * Fuerza la recreación del cliente (util para tests o rotación de credenciales)
 */
export function resetBigcommerceClient(): void {
  if (client) {
    client = null
  }
}
