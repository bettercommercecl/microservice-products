import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import Product from '#models/product'
import { READER_CONNECTION } from '#services/db_reader'
import CacheService from '#services/cache_service'
import syncConfig from '#config/sync'

import Logger from '@adonisjs/core/services/logger'
import pLimit from 'p-limit'

export default class ProductService {
  private readonly logger = Logger.child({ service: 'ProductService' })
  private readonly bigCommerceService = new BigCommerceService()
  private readonly cache = new CacheService()

  /**
   * Obtiene todos los productos (replica + cache Redis si esta configurado).
   */
  async getAllProducts() {
    const cacheKey = 'products:list'
    try {
      const cached = await this.cache.get(cacheKey)
      if (cached) return JSON.parse(cached) as { success: true; data: unknown }

      const products = await (Product.query() as any).useConnection(READER_CONNECTION).fetch()
      const result = { success: true as const, data: products.serialize() }
      await this.cache.set(cacheKey, JSON.stringify(result), syncConfig.cacheTtlProductsSeconds)
      return result
    } catch (error) {
      this.logger.error('Error obteniendo todos los productos', { error: (error as Error).message })
      throw new Error(
        `Error al obtener productos: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  /**
   * Obtiene un producto por ID (replica + cache Redis si esta configurado).
   */
  async getProductById(id: number) {
    const cacheKey = `products:id:${id}`
    try {
      const cached = await this.cache.get(cacheKey)
      if (cached) return JSON.parse(cached) as { success: true; data: unknown }

      const product = await (Product.query() as any)
        .useConnection(READER_CONNECTION)
        .where('id', id)
        .firstOrFail()
      const result = { success: true as const, data: product.serialize() }
      await this.cache.set(cacheKey, JSON.stringify(result), syncConfig.cacheTtlProductsSeconds)
      return result
    } catch (error) {
      this.logger.error('Error obteniendo producto por ID', { id, error: (error as Error).message })
      throw new Error(
        `Error al obtener producto: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  /**
   * Obtiene todos los IDs de productos asignados a un canal, recorriendo todas las páginas
   */
  async getAllProductIdsByChannel(channelId: number, limit = 200) {
    try {
      let allIds: number[] = []

      // 1. Primera petición para saber cuántas páginas hay
      const firstResponse = await this.bigCommerceService.getProductsByChannel(channelId, 1, limit)
      const { data: firstData, meta } = firstResponse

      if (!firstData || firstData.length === 0) {
        return []
      }

      const ids = firstData.map((item: any) => item.product_id || item.id)
      allIds.push(...ids)

      // 2. Calcular total de páginas
      const totalPages = meta && meta.pagination ? meta.pagination.total_pages : 1

      if (totalPages === 1) {
        return allIds.filter(Boolean)
      }

      // 3. Lanzar el resto de páginas en paralelo (con límite de concurrencia optimizado)
      const limitConcurrency = pLimit(15) // OPTIMIZADO: Aumentado de 4 a 15 para mejor rendimiento
      const pagePromises = []

      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          limitConcurrency(async () => {
            const response = await this.bigCommerceService.getProductsByChannel(
              channelId,
              page,
              limit
            )
            return response.data.map((item: any) => item.product_id || item.id)
          })
        )
      }

      const results = await Promise.all(pagePromises)
      results.forEach((pageIds: number[]) => allIds.push(...pageIds))

      return allIds.filter(Boolean)
    } catch (error) {
      this.logger.error('Error obteniendo IDs de productos por canal', {
        channelId,
        limit,
        error: error.message,
      })
      throw error
    }
  }
}
