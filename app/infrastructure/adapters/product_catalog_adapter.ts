import type {
  ProductCatalogPort,
  ProductsPaginatedMeta,
} from '#application/ports/product_catalog.port'
import ProductService from '#services/product_service'
import CacheService from '#services/cache_service'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import ProductRepository from '#infrastructure/persistence/repositories/product_repository'

/**
 * Implementacion del port de catalogo de productos.
 * Delega en ProductService (persistencia, formateo, cache).
 * Las dependencias se inyectan en ProductService (DIP).
 */
export default class ProductCatalogAdapter implements ProductCatalogPort {
  private readonly productService: ProductService

  constructor() {
    this.productService = new ProductService({
      cache: new CacheService(),
      bigCommerce: new BigCommerceService(),
      calculation: new CalculationAdapter(),
      productRepository: new ProductRepository(),
    })
  }

  async getProductsPaginated(
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: unknown }> {
    return this.productService.getProductsPaginated(page, limit)
  }

  async getProductReviewsPaginated(
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }> {
    return this.productService.getProductReviewsPaginated(page, limit)
  }

  async getProductsByChannel(
    channelId: number,
    page: number,
    limit: number,
    parentCategoryId?: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }> {
    return this.productService.getProductsByChannel(channelId, page, limit, parentCategoryId)
  }

  async getProductById(id: number): Promise<{ success: true; data: unknown }> {
    return this.productService.getProductById(id)
  }

  async getAllProducts(): Promise<{ success: true; data: unknown }> {
    return this.productService.getAllProducts()
  }
}
