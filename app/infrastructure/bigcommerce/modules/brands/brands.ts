import type { AxiosInstance } from 'axios'
import type { Logger } from '@adonisjs/core/logger'

export default class BrandsApi {
  constructor(
    private readonly client: AxiosInstance,
    private readonly logger: Logger
  ) {}

  async getAll(ids: number[] = []) {
    try {
      const endpoint =
        ids.length > 0
          ? `/v3/catalog/brands?id:in=${ids.join(',')}`
          : `/v3/catalog/brands?limit=200`

      const response = await this.client.get(endpoint, { timeout: 15_000 })
      return (response.data as { data: unknown }).data
    } catch (error) {
      this.logger.error('Error al obtener marcas de BigCommerce', {
        ids_count: ids.length,
        error: error.message,
      })
      throw new Error(
        `Error fetching brands from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
}
