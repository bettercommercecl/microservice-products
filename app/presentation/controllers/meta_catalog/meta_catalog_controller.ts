import GetMetaCatalogByBrandUseCase from '#application/use_cases/products/get_meta_catalog_by_brand_use_case'
import GetMetaCatalogCsvByBrandUseCase from '#application/use_cases/products/get_meta_catalog_csv_by_brand_use_case'
import ChannelLookupAdapter from '#infrastructure/adapters/channel_lookup_adapter'
import ProductRepository from '#infrastructure/persistence/repositories/product_repository'
import { metaCatalogBrandParamSchema } from '#validators/meta_catalog_brand_validator'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

export default class MetaCatalogController {
  private readonly getMetaCatalogByBrandUseCase: GetMetaCatalogByBrandUseCase
  private readonly getMetaCatalogCsvByBrandUseCase: GetMetaCatalogCsvByBrandUseCase
  private readonly logger = Logger.child({ service: 'MetaCatalogController' })

  constructor() {
    const productRepository = new ProductRepository()
    const channelLookup = new ChannelLookupAdapter()

    this.getMetaCatalogByBrandUseCase = new GetMetaCatalogByBrandUseCase(
      productRepository,
      channelLookup
    )
    this.getMetaCatalogCsvByBrandUseCase = new GetMetaCatalogCsvByBrandUseCase(
      productRepository,
      channelLookup
    )
  }

  /**
   * Feed CSV para catálogo Meta por marca/canal.
   * GET /api/meta/:brand/productos.csv
   */
  async productosCsv({ params, response }: HttpContext) {
    const { brand } = await metaCatalogBrandParamSchema.validate(params)
    this.logger.info({ brand }, 'Generando feed Meta CSV')

    const csv = await this.getMetaCatalogCsvByBrandUseCase.execute(brand)

    response.header('Content-Type', 'text/csv; charset=utf-8')
    response.header('Content-Disposition', 'attachment; filename=productos.csv')
    return response.send(csv)
  }

  /**
   * Misma estructura del feed Meta en JSON para validar datos.
   * GET /api/meta/:brand/productos.json
   */
  async productosJson({ params, response }: HttpContext) {
    const { brand } = await metaCatalogBrandParamSchema.validate(params)
    this.logger.info({ brand }, 'Generando feed Meta JSON')

    const { rows, meta } = await this.getMetaCatalogByBrandUseCase.execute(brand)

    return response.ok({
      success: true,
      data: rows,
      meta,
    })
  }
}
