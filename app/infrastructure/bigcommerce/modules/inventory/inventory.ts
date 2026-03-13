import env from '#start/env'
import type { Logger } from '@adonisjs/core/logger'
import type { AxiosError, AxiosInstance } from 'axios'

interface InventoryLocationResponse {
  data: unknown[]
  meta: { pagination: { total_pages: number } }
}

function extractBigCommerceError(error: AxiosError): Record<string, unknown> {
  const response = error.response
  return {
    status: response?.status,
    statusText: response?.statusText,
    message: error.message,
    bcTitle: response?.data && typeof response.data === 'object' && 'title' in response.data
      ? (response.data as { title?: string }).title
      : undefined,
    bcDetail: response?.data && typeof response.data === 'object' && 'detail' in response.data
      ? (response.data as { detail?: string }).detail
      : undefined,
    bcErrors: response?.data && typeof response.data === 'object' && 'errors' in response.data
      ? (response.data as { errors?: unknown }).errors
      : undefined,
    bcRaw: response?.data,
    endpoint: error.config?.url,
    method: error.config?.method,
  }
}

export default class InventoryApi {
  constructor(
    private readonly client: AxiosInstance,
    private readonly logger: Logger
  ) {}

  /**
   * Obtiene el stock de seguridad de la ubicación principal configurada en .env
   */
  async getSafeStockGlobal(page = 1) {
    const locationId = env.get(`INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')}`) || ''
    try {
      return await this.fetchInventoryByLocation(locationId, page)
    } catch (error: any) {
      const ctx = extractBigCommerceError(error)
      this.logger.error('Error al obtener stock de seguridad', ctx)
      return {
        status: 'Error',
        message: 'Error al intentar obtener el stock de seguridad de bigcommerce',
        code: error.message,
        title: ctx.bcTitle,
        detail: ctx.bcDetail,
        errors: ctx.bcErrors,
        httpStatus: ctx.status,
        endpoint: ctx.endpoint,
        bcResponse: ctx.bcRaw,
      }
    }
  }

  /**
   * Obtiene el inventario de reserva para una ubicación específica
   */
  async getInventoryGlobalReserve(locationId: string, page = 1) {
    try {
      return await this.fetchInventoryByLocation(locationId, page)
    } catch (error: any) {
      const ctx = extractBigCommerceError(error)
      this.logger.error('Error al obtener stock de reserva', { location_id: locationId, ...ctx })
      return {
        status: 'Error',
        message: `Error al intentar obtener el stock de seguridad desde BigCommerce para location ${locationId}`,
        code: error.message,
        title: ctx.bcTitle,
        detail: ctx.bcDetail,
        errors: ctx.bcErrors,
        httpStatus: ctx.status,
        endpoint: ctx.endpoint,
        bcResponse: ctx.bcRaw,
      }
    }
  }

  /**
   * Lógica compartida para obtener inventario paginado por ubicación
   */
  private async fetchInventoryByLocation(locationId: string, startPage = 1) {
    const endpoint = `/v3/inventory/locations/${locationId}/items`

    const firstPageResponse = await this.client.get<InventoryLocationResponse>(endpoint, {
      params: { page: startPage },
    })
    const totalPages = firstPageResponse.data.meta.pagination.total_pages
    const pagesToFetch = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)

    const pagesData = await Promise.all(
      pagesToFetch.map((pageNumber) =>
        this.client
          .get<InventoryLocationResponse>(endpoint, { params: { page: pageNumber } })
          .then((response) => response.data.data)
      )
    )

    return [...firstPageResponse.data.data, ...pagesData.flat()]
  }

  /**
   * Actualiza configuracion de inventario en una ubicacion.
   * PUT /v3/inventory/locations/{location_id}/items
   */
  async updateLocationItems(
    locationId: string,
    settings: Array<{
      identity?: { sku?: string; variant_id?: number }
      safety_stock?: number
      is_in_stock?: boolean
      warning_level?: number
      bin_picking_number?: string
    }>
  ): Promise<{ transaction_id?: string }> {
    if (settings.length === 0) {
      return {}
    }

    const BATCH_SIZE = 500
    let lastResponse: any = {}
    for (let i = 0; i < settings.length; i += BATCH_SIZE) {
      const batch = settings.slice(i, i + BATCH_SIZE)
      const response = await this.client.put(
        `/v3/inventory/locations/${locationId}/items`,
        { settings: batch },
        { timeout: 30_000 }
      )
      lastResponse = response.data
    }
    return lastResponse
  }
}
