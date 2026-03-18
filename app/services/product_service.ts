import type { CalculationPort } from '#application/ports/calculation.port'
import type { ProductRepositoryPort } from '#application/ports/product_repository.port'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import { toProductForFormatDTO } from '#infrastructure/mappers/product_format.mapper'
import Product from '#models/product'
import CacheService from '#services/cache_service'
import syncConfig from '#config/sync'
import { getSizesConfig } from '#config/sizes_config'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import pLimit from 'p-limit'

export type ProductsPaginatedMeta = {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage: number
  firstPageUrl: string
  lastPageUrl: string
  nextPageUrl: string | null
  previousPageUrl: string | null
}

type ProductsByChannelResponse = {
  data?: unknown[]
  meta?: { pagination?: { total_pages?: number } }
}

export interface ProductServiceDeps {
  cache: CacheService
  bigCommerce: BigCommerceService
  calculation: CalculationPort
  productRepository: ProductRepositoryPort
}

export default class ProductService {
  private readonly logger = Logger.child({ service: 'ProductService' })
  private readonly bigCommerceService: BigCommerceService
  private readonly cache: CacheService
  private readonly calculation: CalculationPort
  private readonly productRepository: ProductRepositoryPort

  constructor(deps: ProductServiceDeps) {
    this.cache = deps.cache
    this.bigCommerceService = deps.bigCommerce
    this.calculation = deps.calculation
    this.productRepository = deps.productRepository
  }

  /**
   * Obtiene todos los productos (cache Redis si esta configurado).
   * Usa Product.all() y serialize() para mantener la misma estructura que las rutas antiguas.
   */
  async getAllProducts() {
    const cacheKey = 'products:list'
    try {
      const cached = await this.cache.get(cacheKey)
      if (cached) return JSON.parse(cached) as { success: true; data: unknown }

      const products = await this.productRepository.findAll()
      const data = (products as { serialize: () => unknown }[]).map((p) => p.serialize())
      const result = { success: true as const, data }
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
   * Obtiene un producto por ID (cache Redis si esta configurado).
   * Respuesta con la misma estructura que las rutas antiguas.
   */
  async getProductById(id: number) {
    const cacheKey = `products:id:${id}`
    try {
      const cached = await this.cache.get(cacheKey)
      if (cached) return JSON.parse(cached) as { success: true; data: unknown }

      const product = await this.productRepository.findById(id)
      if (!product) throw new Error(`Producto no encontrado: ${id}`)
      const result = { success: true as const, data: (product as { serialize: () => unknown }).serialize() }
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
      const firstResponse = (await this.bigCommerceService.getProductsByChannel(
        channelId,
        1,
        limit
      )) as ProductsByChannelResponse
      const { data: firstData, meta } = firstResponse

      if (!firstData || firstData.length === 0) {
        return []
      }

      const ids = firstData.map((item: any) => item.product_id || item.id)
      allIds.push(...ids)

      // 2. Calcular total de páginas
      const totalPages = meta?.pagination?.total_pages ?? 1

      if (totalPages === 1) {
        return allIds.filter(Boolean)
      }

      // 3. Lanzar el resto de páginas en paralelo (con límite de concurrencia optimizado)
      const limitConcurrency = pLimit(15) // OPTIMIZADO: Aumentado de 4 a 15 para mejor rendimiento
      const pagePromises = []

      for (let page = 2; page <= totalPages; page++) {
        pagePromises.push(
          limitConcurrency(async () => {
            const response = (await this.bigCommerceService.getProductsByChannel(
              channelId,
              page,
              limit
            )) as ProductsByChannelResponse
            return (response.data ?? []).map((item: any) => item.product_id || item.id)
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

  /**
   * Lista productos paginados para marcas
   */
  async getProductsPaginated(page: number, limit: number) {
    const { data: items, meta } = await this.productRepository.findPaginated(page, limit)
    const data = (items as { serialize: () => unknown }[]).map((p) => p.serialize())
    return { success: true as const, data, meta }
  }

  /**
   * Lista reseñas de productos paginadas (50 por página)
   */
  async getProductReviewsPaginated(page: number, limit: number) {
    const { data: items, meta } = await this.productRepository.findReviewsPaginated(page, limit)
    const rows = (items as { serialize: () => unknown }[]).map((p) => p.serialize()) as Array<{
      product_id?: number
      reviews?: unknown
    }>

    const data = rows
      .map((row) => {
        const productId = typeof row.product_id === 'number' ? row.product_id : undefined
        const reviewsValue = row.reviews

        if (reviewsValue && typeof reviewsValue === 'object' && !Array.isArray(reviewsValue)) {
          const obj = reviewsValue as Record<string, unknown>
          const list = Array.isArray(obj.reviews) ? obj.reviews : []
          if (list.length === 0) return null
          return {
            product_id: productId ?? (typeof obj.product_id === 'number' ? (obj.product_id as number) : undefined),
            quantity: typeof obj.quantity === 'number' ? obj.quantity : undefined,
            rating: typeof obj.rating === 'number' ? obj.rating : undefined,
            reviews: list,
          }
        }

        if (Array.isArray(reviewsValue)) {
          if (reviewsValue.length === 0) return null
          return {
            product_id: productId,
            quantity: reviewsValue.length,
            rating: undefined,
            reviews: reviewsValue,
          }
        }

        return null
      })
      .filter(Boolean)

    return { success: true as const, data, meta }
  }

  /**
   * Lista productos de un canal en el formato que consumen y guardan las marcas.
   */
  async getProductsByChannel(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }> {
    const { data: items, meta } = await this.productRepository.findPaginatedByChannel(
      channelId,
      page,
      limit
    )
    const { formatProductForMarcas } = await import('#application/formatters/products_by_channel_formatter')
    const options = {
      percentTransfer: Number(env.get('PERCENT_DISCOUNT_TRANSFER_PRICE')) || 2,
      idPacks: env.get('ID_PACKS') != null ? Number(env.get('ID_PACKS')) : undefined,
      sizesConfig: getSizesConfig(),
    }
    const data = await Promise.all(
      (items as Product[]).map((p) =>
        formatProductForMarcas(toProductForFormatDTO(p), this.calculation, options)
      )
    )
    return { success: true, data, meta: meta as ProductsPaginatedMeta }
  }
}
