import env from '#start/env'
import axios, { type AxiosInstance } from 'axios'
import http from 'node:http'
import https from 'node:https'

const axiosCreate = (axios as unknown as { create: (config?: object) => AxiosInstance }).create
let client: AxiosInstance | null = null

/**
 * Cliente HTTP dedicado a n8n con Basic Auth y keepAlive
 */
export function getN8nClient(): AxiosInstance {
  if (!client) {
    const user = env.get('API_N8N_USER') || ''
    const password = env.get('VALUE_API_N8N') || ''

    client = axiosCreate({
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      auth: { username: user, password },
      httpAgent: new http.Agent({ keepAlive: true, maxSockets: 10 }),
      httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 10 }),
    })
  }

  return client
}

/**
 * Fuerza la recreacion del cliente (util para tests o rotacion de credenciales)
 */
export function resetN8nClient(): void {
  if (client) {
    client = null
  }
}
