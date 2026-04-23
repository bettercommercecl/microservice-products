import { getN8nClient } from '#infrastructure/http/n8n_client'
import InventoryReserve from '#models/inventory_reserve'
import N8nAlertService from '#services/n8n_alert_service'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'

// Estructura que devuelve el webhook de n8n
interface ReserveApiResponse {
  row_number: number
  SKU: number
  FECHA: string | null
  BPN: string
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
   * Solo persiste o purga tras HTTP 200 y payload JSON en forma de array (axios ya rechaza otros status).
   * Lista vacia [] legitima: vacia inventory_reserve. Filas con datos pero sin ningun SKU valido: error, sin tocar BD.
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
      const response = await client.get<ReserveApiResponse[]>(reservesUrl, {
        validateStatus: (status) => status === 200,
      })

      if (!Array.isArray(response.data)) {
        throw new Error('La respuesta de n8n no es un array valido')
      }

      const payload = response.data
      for (const [i, row] of payload.entries()) {
        if (row === null || typeof row !== 'object' || Array.isArray(row)) {
          throw new Error(`n8n fila ${i}: se esperaba un objeto por fila`)
        }
      }

      const rawNormalized = this.normalizeResponse(payload)
      const normalized = this.dedupeBySkuLastWins(rawNormalized)

      if (payload.length > 0 && normalized.length === 0) {
        throw new Error(
          'n8n devolvio filas pero ningun SKU valido; se aborta para no vaciar inventory_reserve por error de datos'
        )
      }

      if (rawNormalized.length > 0 && rawNormalized.length !== normalized.length) {
        this.logger.warn(
          {
            filas_n8n: rawNormalized.length,
            skus_unicos: normalized.length,
          },
          'n8n devolvio SKUs duplicados; se conserva la ultima fila por sku'
        )
      }

      if (payload.length === 0) {
        return await this.syncWhenN8nReturnedEmpty()
      }

      const skusFromN8n = normalized.map((row) => row.sku)

      let removed = 0
      await db.transaction(async (trx) => {
        await InventoryReserve.updateOrCreateMany('sku', normalized, { client: trx })
        const orphanCountRow = await InventoryReserve.query({ client: trx })
          .whereNotIn('sku', skusFromN8n)
          .count('* as total')
          .first()
        removed = Number((orphanCountRow as { $extras?: { total?: number } })?.$extras?.total ?? 0)
        if (removed > 0) {
          await InventoryReserve.query({ client: trx }).whereNotIn('sku', skusFromN8n).delete()
        }
      })

      this.logger.info(
        { total: normalized.length, eliminadas: removed },
        'Reservas sincronizadas correctamente'
      )

      return {
        success: true,
        total: normalized.length,
        message:
          removed > 0
            ? `${normalized.length} reservas sincronizadas; ${removed} obsoletas eliminadas`
            : `${normalized.length} reservas sincronizadas`,
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

  /** Solo con array vacio en respuesta 200: vacia inventory_reserve (no usar cuando hubo filas invalidas). */
  private async syncWhenN8nReturnedEmpty(): Promise<{
    success: boolean
    total: number
    message: string
  }> {
    const countRow = await InventoryReserve.query().count('* as total').first()
    const existingCount = Number(
      (countRow as { $extras?: { total?: number } })?.$extras?.total ?? 0
    )

    if (existingCount === 0) {
      this.logger.info('n8n sin filas y inventory_reserve ya vacio')
      return {
        success: true,
        total: 0,
        message: 'Sin reservas en n8n; inventory_reserve sin cambios',
      }
    }

    await db.transaction(async (trx) => {
      await InventoryReserve.query({ client: trx }).delete()
    })
    this.logger.info({ eliminadas: existingCount }, 'n8n sin filas; inventory_reserve purgado')

    return {
      success: true,
      total: 0,
      message: `Sin reservas en n8n; ${existingCount} filas eliminadas en inventory_reserve`,
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
        bp: item.BPN || null,
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
