import { getN8nClient } from '#infrastructure/http/n8n_client'
import InventoryReserve from '#models/inventory_reserve'
import N8nAlertService from '#services/n8n_alert_service'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'

// Estructura que devuelve el webhook de n8n
interface ReserveApiResponse {
  row_number: number
  SKU: number
  FECHA: string | null
  BP: string
  WARNING: string | null
  STOCK: number | null
}

// Estructura normalizada para persistencia
interface NormalizedReserve {
  sku: string
  fecha_reserva: string | null
  bp: string | null
  warning: string | null
  stock: number | null
}

export default class N8nReserveService {
  private readonly logger = Logger.child({ service: 'N8nReserveService' })

  /**
   * Obtiene todas las reservas desde n8n, normaliza y persiste en inventory_reserve.
   * En cada sincronizacion se actualizan o crean los registros por SKU.
   */
  async fetchAndSaveReserves(): Promise<{
    success: boolean
    total: number
    message: string
  }> {
    const reservesUrl = this.getUrlByCountry()

    try {
      if (!reservesUrl) {
        this.logger.warn('URL_N8N_RESERVES no configurada, omitiendo reservas')
        return { success: true, total: 0, message: 'URL no configurada, omitiendo reservas' }
      }

      this.logger.info('Obteniendo reservas desde n8n...')

      const client = getN8nClient()
      const response = await client.get<ReserveApiResponse[]>(reservesUrl)

      if (!Array.isArray(response.data)) {
        throw new Error('La respuesta de n8n no es un array valido')
      }

      const rawNormalized = this.normalizeResponse(response.data)
      const normalized = this.dedupeBySkuLastWins(rawNormalized)

      if (normalized.length === 0) {
        this.logger.info('n8n no retorno reservas para este pais')
        return { success: true, total: 0, message: 'Sin reservas disponibles' }
      }

      if (rawNormalized.length !== normalized.length) {
        this.logger.warn(
          {
            filas_n8n: rawNormalized.length,
            skus_unicos: normalized.length,
          },
          'n8n devolvio SKUs duplicados; se conserva la ultima fila por sku'
        )
      }

      await InventoryReserve.updateOrCreateMany('sku', normalized)

      this.logger.info({ total: normalized.length }, 'Reservas sincronizadas correctamente')

      return {
        success: true,
        total: normalized.length,
        message: `${normalized.length} reservas sincronizadas`,
      }
    } catch (error: any) {
      this.logger.error(
        {
          error: error.message,
          status: error.response?.status,
        },
        'Error obteniendo reservas desde n8n'
      )
      if (reservesUrl) {
        const ref = error?.message ?? String(error)
        await new N8nAlertService().send('n8n_reservas:fetch_fallido', ref, {
          country: env.get('COUNTRY_CODE'),
        })
      }
      throw error
    }
  }

  /**
   * Busca la reserva de un SKU en la tabla inventory_reserve
   */
  async getReserveBySku(sku: string): Promise<InventoryReserve | null> {
    return InventoryReserve.query().where('sku', sku).first()
  }

  /**
   * Busca reservas para multiples SKUs en un solo query (batch lookup)
   */
  async getReservesBySkus(skus: string[]): Promise<Map<string, InventoryReserve>> {
    if (skus.length === 0) return new Map()

    const reserves = await InventoryReserve.query().whereIn('sku', skus)

    const map = new Map<string, InventoryReserve>()
    for (const reserve of reserves) {
      map.set(reserve.sku, reserve)
    }

    return map
  }

  /**
   * Un sku por fila: para asegurar que no haya duplicados en la tabla inventory_reserve
   */
  private dedupeBySkuLastWins(rows: NormalizedReserve[]): NormalizedReserve[] {
    const bySku = new Map<string, NormalizedReserve>()
    for (const row of rows) {
      const sku = row.sku.trim()
      if (!sku) continue
      bySku.set(sku, { ...row, sku })
    }
    return [...bySku.values()]
  }

  /**
   * Normaliza la respuesta cruda de n8n al formato de la tabla inventory_reserve
   */
  private normalizeResponse(raw: ReserveApiResponse[]): NormalizedReserve[] {
    return raw.map((item) => {
      let fechaReserva = item.FECHA
      if (typeof fechaReserva === 'string') {
        fechaReserva = fechaReserva.trim() || null
      } else {
        fechaReserva = null
      }

      return {
        sku: String(item.SKU).trim(),
        fecha_reserva: fechaReserva,
        bp: item.BP || null,
        warning: item.WARNING || null,
        stock: Number(item.STOCK || 0) ?? null,
      }
    })
  }

  /**
   * Determina la URL del webhook de n8n segun el pais configurado
   */
  private getUrlByCountry(): string {
    return env.get(`URL_N8N_RESERVES_${env.get('COUNTRY_CODE').toUpperCase()}`) || ''
  }
}
