import type {
  VariantCatalogPort,
  VariantsPaginatedMeta,
} from '#application/ports/variant_catalog.port'

/**
 * Caso de uso: variantes por canal en formato marcas.
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetVariantsByChannelUseCase {
  constructor(private readonly catalog: VariantCatalogPort) {}

  async execute(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ data: unknown[]; meta: VariantsPaginatedMeta }> {
    return this.catalog.getVariantsByChannelForMarcas(channelId, page, limit)
  }
}
