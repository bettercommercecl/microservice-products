import type {
  VariantCatalogPort,
  VariantsPaginatedMeta,
} from '#application/ports/variant_catalog.port'
import type { ChannelLookupPort } from '#application/ports/channel_lookup.port'

/**
 * Caso de uso: variantes por canal en formato marcas.
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetVariantsByChannelUseCase {
  constructor(
    private readonly catalog: VariantCatalogPort,
    private readonly channelLookup: ChannelLookupPort
  ) {}

  async execute(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ data: unknown[]; meta: VariantsPaginatedMeta }> {
    const parentCategoryId = await this.channelLookup.getParentCategoryId(channelId)
    return this.catalog.getVariantsByChannelForMarcas(channelId, page, limit, parentCategoryId)
  }
}
