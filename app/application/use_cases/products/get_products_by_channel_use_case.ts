import type {
  ProductCatalogPort,
  ProductsPaginatedMeta,
} from '#application/ports/product_catalog.port'

/**
 * Caso de uso: obtener productos por canal en formato marcas.
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetProductsByChannelUseCase {
  constructor(private readonly catalog: ProductCatalogPort) {}

  async execute(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }> {
    return this.catalog.getProductsByChannel(channelId, page, limit)
  }
}
