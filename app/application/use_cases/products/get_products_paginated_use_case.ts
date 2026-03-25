import type { ProductCatalogPort } from '#application/ports/product_catalog.port'

/**
 * Caso de uso: obtener productos paginados.
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetProductsPaginatedUseCase {
  constructor(private readonly catalog: ProductCatalogPort) {}

  async execute(page: number, limit: number): Promise<{ success: true; data: unknown[]; meta: unknown }> {
    return this.catalog.getProductsPaginated(page, limit)
  }
}
