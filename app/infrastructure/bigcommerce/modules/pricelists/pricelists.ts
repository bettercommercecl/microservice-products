import type { AxiosInstance } from 'axios'
import type { Logger } from '@adonisjs/core/logger'
import type {
  PriceListRecord,
  PriceListRecordsParams,
  PriceListRecordsResponse,
} from './interfaces/pricelist_record.interface.js'

/**
 * Modulo de Price Lists de BigCommerce.
 * Obtiene precios por variante segun el price list del pais.
 *
 * Limitacion de la API: maximo 10 GET simultaneos por store.
 * El interceptor global de rate limit ya controla reintentos en 429,
 * pero controlamos concurrencia en paginacion para no saturar.
 */
export default class PriceListsApi {
  private static readonly MAX_CONCURRENT_PAGES = 8
  private static readonly DEFAULT_LIMIT = 250

  constructor(
    private readonly client: AxiosInstance,
    private readonly logger: Logger
  ) {}

  /**
   * Obtiene una pagina de registros del price list
   */
  async getPage(
    priceListId: number,
    params: PriceListRecordsParams = {}
  ): Promise<PriceListRecordsResponse> {
    const endpoint = `/v3/pricelists/${priceListId}/records`

    const queryParams = this.buildQueryParams(params)
    const response = await this.client.get(endpoint, { params: queryParams })
    return response.data
  }

  /**
   * Obtiene todos los registros del price list con paginacion automatica.
   * Controla concurrencia para respetar el limite de 10 requests simultaneos.
   */
  async getAll(
    priceListId: number,
    params: Omit<PriceListRecordsParams, 'page'> = {}
  ): Promise<PriceListRecord[]> {
    const endpoint = `/v3/pricelists/${priceListId}/records`
    const limit = params.limit ?? PriceListsApi.DEFAULT_LIMIT
    const queryParams = this.buildQueryParams({ ...params, limit, page: 1 })

    const firstResponse = await this.client.get<PriceListRecordsResponse>(endpoint, {
      params: queryParams,
    })

    const allRecords = [...firstResponse.data.data]
    const pagination = firstResponse.data.meta?.pagination

    if (!pagination || pagination.total_pages <= 1) {
      this.logger.info(
        { priceListId, total: allRecords.length },
        'Price list records obtenidos (pagina unica)'
      )
      return allRecords
    }

    const remainingPages = Array.from({ length: pagination.total_pages - 1 }, (_, i) => i + 2)

    const pagesData = await this.fetchPagesWithConcurrency(
      endpoint,
      { ...queryParams, page: undefined },
      remainingPages,
      PriceListsApi.MAX_CONCURRENT_PAGES
    )

    allRecords.push(...pagesData)

    this.logger.info(
      { priceListId, total: allRecords.length, pages: pagination.total_pages },
      'Price list records obtenidos (todas las paginas)'
    )

    return allRecords
  }

  /**
   * Obtiene registros filtrados por IDs de variante.
   * Util para consultar precios de un lote especifico.
   */
  async getByVariantIds(
    priceListId: number,
    variantIds: number[],
    params: Omit<PriceListRecordsParams, 'page' | 'variant_id:in'> = {}
  ): Promise<PriceListRecord[]> {
    if (variantIds.length === 0) return []

    return this.getAll(priceListId, {
      ...params,
      'variant_id:in': variantIds,
    })
  }

  /**
   * Obtiene registros filtrados por IDs de producto.
   * BigCommerce resuelve internamente las variantes de cada producto.
   */
  async getByProductIds(
    priceListId: number,
    productIds: number[],
    params: Omit<PriceListRecordsParams, 'page' | 'product_id:in'> = {}
  ): Promise<PriceListRecord[]> {
    if (productIds.length === 0) return []

    return this.getAll(priceListId, {
      ...params,
      'product_id:in': productIds,
    })
  }

  /**
   * Indexa los registros por variant_id para acceso O(1).
   * Permite obtener el precio de cualquier variante sin recorrer todo el array.
   */
  static indexByVariantId(records: PriceListRecord[]): Map<number, PriceListRecord> {
    const map = new Map<number, PriceListRecord>()
    for (const record of records) {
      map.set(record.variant_id, record)
    }
    return map
  }

  /**
   * Indexa los registros agrupados por product_id.
   * Cada producto puede tener multiples variantes con precios distintos.
   */
  static indexByProductId(records: PriceListRecord[]): Map<number, PriceListRecord[]> {
    const map = new Map<number, PriceListRecord[]>()
    for (const record of records) {
      const existing = map.get(record.product_id)
      if (existing) {
        existing.push(record)
      } else {
        map.set(record.product_id, [record])
      }
    }
    return map
  }

  // ================================================================
  // PRIVADOS
  // ================================================================

  /**
   * Pagina en lotes controlados para no exceder el limite de concurrencia.
   * BigCommerce permite maximo 10 GET simultaneos en este endpoint.
   */
  private async fetchPagesWithConcurrency(
    endpoint: string,
    baseParams: Record<string, any>,
    pages: number[],
    concurrency: number
  ): Promise<PriceListRecord[]> {
    const results: PriceListRecord[] = []

    for (let i = 0; i < pages.length; i += concurrency) {
      const chunk = pages.slice(i, i + concurrency)

      const chunkData = await Promise.all(
        chunk.map((pageNumber) =>
          this.client
            .get<PriceListRecordsResponse>(endpoint, {
              params: { ...baseParams, page: pageNumber },
            })
            .then((response) => response.data.data)
        )
      )

      results.push(...chunkData.flat())
    }

    return results
  }

  /**
   * Convierte los params tipados al formato que espera axios.
   * Los arrays se serializan como comma-separated para la API de BigCommerce.
   */
  private buildQueryParams(params: PriceListRecordsParams): Record<string, any> {
    const query: Record<string, any> = {}

    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue

      if (Array.isArray(value)) {
        query[key] = value.join(',')
      } else {
        query[key] = value
      }
    }

    return query
  }
}
