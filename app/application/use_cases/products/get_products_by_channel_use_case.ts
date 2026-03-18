import type {
  ProductCatalogPort,
  ProductsPaginatedMeta,
} from '#application/ports/product_catalog.port'
import type { ChannelLookupPort } from '#application/ports/channel_lookup.port'

/**
 * Caso de uso: obtener productos por canal en formato marcas.
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetProductsByChannelUseCase {
  constructor(
    private readonly catalog: ProductCatalogPort,
    private readonly channelLookup: ChannelLookupPort
  ) {}

  async execute(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }> {
    const parentCategoryId = await this.channelLookup.getParentCategoryId(channelId)
    return this.catalog.getProductsByChannel(channelId, page, limit, parentCategoryId)
  }
}
