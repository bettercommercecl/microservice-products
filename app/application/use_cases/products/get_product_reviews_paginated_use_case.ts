import type {
  ProductCatalogPort,
  ProductsPaginatedMeta,
} from '#application/ports/product_catalog.port'

/**
 * Caso de uso: obtener reseñas de productos paginadas.
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetProductReviewsPaginatedUseCase {
  constructor(private readonly catalog: ProductCatalogPort) {}

  async execute(
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }> {
    return this.catalog.getProductReviewsPaginated(page, limit)
  }
}

