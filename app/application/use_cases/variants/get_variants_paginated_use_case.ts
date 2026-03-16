import type {
  VariantCatalogPort,
  VariantsPaginatedMeta,
} from '#application/ports/variant_catalog.port'

/**
 * Caso de uso: variantes paginadas (estructura de tabla para marcas).
 * Depende del port; la infraestructura inyecta el adapter.
 */
export default class GetVariantsPaginatedUseCase {
  constructor(private readonly catalog: VariantCatalogPort) {}

  async execute(
    page: number,
    limit: number
  ): Promise<{ data: Record<string, unknown>[]; meta: VariantsPaginatedMeta }> {
    return this.catalog.getVariantsPaginatedTableShape(page, limit)
  }
}
