import type { ProductCatalogPort } from '#application/ports/product_catalog.port'

/**
 * Caso de uso: obtener todos los productos (lista sin paginacion).
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetAllProductsUseCase {
  constructor(private readonly catalog: ProductCatalogPort) {}

  async execute(): Promise<{ success: true; data: unknown }> {
    return this.catalog.getAllProducts()
  }
}
