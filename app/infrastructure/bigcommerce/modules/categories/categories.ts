import type { AxiosInstance } from 'axios'
import type { Logger } from '@adonisjs/core/logger'

export default class CategoriesApi {
  constructor(
    private readonly client: AxiosInstance,
    private readonly logger: Logger
  ) {}

  async getAll() {
    try {
      const allCategories = []
      let currentPage = 1
      let totalPages = 1

      while (currentPage <= totalPages) {
        const results = await this.client.get('/v3/catalog/trees/categories', {
          params: { limit: 250, page: currentPage },
          timeout: 15_000,
        })

        const body = results.data as { data: unknown[]; meta: { pagination: { total_pages: number } } }
        const { data, meta } = body
        allCategories.push(...data)
        totalPages = meta.pagination.total_pages
        currentPage++
      }

      return allCategories
    } catch (error) {
      this.logger.error('Error al obtener las categorías de BigCommerce', {
        error: error.message,
      })
      throw new Error(
        `Error al obtener las categorías: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
}
