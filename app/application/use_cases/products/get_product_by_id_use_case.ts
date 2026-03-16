import type { ProductCatalogPort } from '#application/ports/product_catalog.port'

/**
 * Caso de uso: obtener un producto por ID.
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetProductByIdUseCase {
  constructor(private readonly catalog: ProductCatalogPort) {}

  async execute(id: number): Promise<{ success: true; data: unknown }> {
    return this.catalog.getProductById(id)
  }
}
