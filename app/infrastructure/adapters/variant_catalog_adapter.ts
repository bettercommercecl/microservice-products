import type { VariantCatalogPort, VariantsPaginatedMeta } from '#application/ports/variant_catalog.port'
import VariantService from '#services/variant_service'
import CategoryService from '#services/categories_service'
import ProductTagsCampaignsService from '#services/product_tags_campaigns_service'
import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import VariantRepository from '#infrastructure/persistence/repositories/variant_repository'

/**
 * Implementacion del port de catalogo de variantes.
 * Delega en VariantService (persistencia, formateo).
 * Las dependencias se inyectan en VariantService (DIP).
 */
export default class VariantCatalogAdapter implements VariantCatalogPort {
  private readonly variantService: VariantService

  constructor() {
    this.variantService = new VariantService({
      productTagsCampaignsService: new ProductTagsCampaignsService({
        categoryService: new CategoryService(),
      }),
      calculation: new CalculationAdapter(),
      variantRepository: new VariantRepository(),
    })
  }

  async getVariantsPaginatedTableShape(
    page: number,
    limit: number
  ): Promise<{ data: Record<string, unknown>[]; meta: VariantsPaginatedMeta }> {
    return this.variantService.getVariantsPaginatedTableShape(page, limit)
  }

  async getVariantsByChannelForMarcas(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ data: unknown[]; meta: VariantsPaginatedMeta }> {
    return this.variantService.getVariantsByChannelForMarcas(channelId, page, limit)
  }
}
