import { generateMetaCatalogCsv } from '#application/formatters/meta_catalog_csv_formatter'
import type { ChannelLookupPort } from '#application/ports/channel_lookup.port'
import type { ProductRepositoryPort } from '#application/ports/product_repository.port'
import GetMetaCatalogByBrandUseCase from '#application/use_cases/products/get_meta_catalog_by_brand_use_case'

export default class GetMetaCatalogCsvByBrandUseCase {
  private readonly getMetaCatalogByBrandUseCase: GetMetaCatalogByBrandUseCase

  constructor(productRepository: ProductRepositoryPort, channelLookup: ChannelLookupPort) {
    this.getMetaCatalogByBrandUseCase = new GetMetaCatalogByBrandUseCase(
      productRepository,
      channelLookup
    )
  }

  async execute(brand: string): Promise<string> {
    const { rows } = await this.getMetaCatalogByBrandUseCase.execute(brand)
    return generateMetaCatalogCsv(rows)
  }
}
