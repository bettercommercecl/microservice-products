import Channel from '#models/channel'
import ChannelProduct from '#models/channel_product'
import Variant from '#models/variant'
import GetProductsPaginatedUseCase from '#application/use_cases/products/get_products_paginated_use_case'
import GetProductsByChannelUseCase from '#application/use_cases/products/get_products_by_channel_use_case'
import GetProductByIdUseCase from '#application/use_cases/products/get_product_by_id_use_case'
import GetAllProductsUseCase from '#application/use_cases/products/get_all_products_use_case'
import GetProductReviewsPaginatedUseCase from '#application/use_cases/products/get_product_reviews_paginated_use_case'
import ProductCatalogAdapter from '#infrastructure/adapters/product_catalog_adapter'
import ChannelLookupAdapter from '#infrastructure/adapters/channel_lookup_adapter'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import { productShowSchema } from '#validators/product_show_validator'
import { productsByChannelSchema } from '#validators/products_by_channel_validator'
import { productsPaginatedSchema } from '#validators/products_paginated_validator'
import { reviewsPaginatedSchema } from '#validators/reviews_paginated_validator'

export default class ProductsController {
  private readonly getProductsPaginatedUseCase: GetProductsPaginatedUseCase
  private readonly getProductReviewsPaginatedUseCase: GetProductReviewsPaginatedUseCase
  private readonly getProductsByChannelUseCase: GetProductsByChannelUseCase
  private readonly getProductByIdUseCase: GetProductByIdUseCase
  private readonly getAllProductsUseCase: GetAllProductsUseCase
  private readonly logger = Logger.child({ service: 'ProductsController' })

  constructor() {
    const productCatalog = new ProductCatalogAdapter()
    this.getProductsPaginatedUseCase = new GetProductsPaginatedUseCase(productCatalog)
    this.getProductReviewsPaginatedUseCase = new GetProductReviewsPaginatedUseCase(productCatalog)
    this.getProductsByChannelUseCase = new GetProductsByChannelUseCase(
      productCatalog,
      new ChannelLookupAdapter()
    )
    this.getProductByIdUseCase = new GetProductByIdUseCase(productCatalog)
    this.getAllProductsUseCase = new GetAllProductsUseCase(productCatalog)
  }

  /**
   * Lista productos paginados para marcas (page, limit y metadata).
   * GET /api/products/paginated?page=1&limit=50
   */
  async indexPaginated({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: productsPaginatedSchema,
      data: request.qs(),
    })
    const page = validated.page ?? 1
    const limit = validated.limit ?? 50
    const result = await this.getProductsPaginatedUseCase.execute(page, limit)
    return response.ok(result)
  }

  /**
   * Lista reseñas de productos paginadas (50 por página).
   * GET /api/products/reviews/paginated?page=1
   */
  async reviewsPaginated({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: reviewsPaginatedSchema,
      data: request.qs(),
    })
    const page = validated.page ?? 1
    const limit = 50
    const result = await this.getProductReviewsPaginatedUseCase.execute(page, limit)
    return response.ok(result)
  }

  /**
   * Lista productos por canal. Query: channel_id (number) o brand (string).
   * Si viene brand, se busca el canal por nombre en la tabla channels y se usa su id.
   * GET /api/products/by-channel?channel_id=1 o ?brand=UF
   */
  async byChannel({ request, response }: HttpContext) {
    const validated = await vine.validate({
      schema: productsByChannelSchema,
      data: request.qs(),
    })
    const { channel_id: channelIdParam, brand } = validated
    if (channelIdParam === undefined && !brand) {
      return response.badRequest({
        success: false,
        message: 'Debe indicar channel_id (número) o brand (nombre del canal)',
      })
    }
    let channelId: number
    if (channelIdParam !== undefined) {
      channelId = channelIdParam
    } else {
      const channel = await Channel.query().where('name', brand!).first()
      if (!channel) {
        return response.notFound({
          success: false,
          message: `Canal no encontrado con nombre: ${brand}`,
        })
      }
      channelId = channel.id
    }
    const page = validated.page ?? 1
    const limit = validated.limit ?? 50
    const result = await this.getProductsByChannelUseCase.execute(channelId, page, limit)
    return response.ok(result)
  }

  /**
   * Obtiene todos los productos (sin paginación, para compatibilidad).
   */
  async index({ response }: HttpContext) {
    const products = await this.getAllProductsUseCase.execute()
    return response.ok(products)
  }

  /**
   * Obtiene un producto por ID
   */
  async show({ params, response }: HttpContext) {
    const validatedData = await vine.validate({
      schema: productShowSchema,
      data: params,
    })
    const { id: productId } = validatedData

    const product = await this.getProductByIdUseCase.execute(productId)

    if (!product || !product.data) {
      this.logger.error(`Producto no encontrado con ID: ${productId}`)
      throw new Error('Producto no encontrado')
    }

    return response.ok(product)
  }

  /**
   * Estadísticas de sincronización de un canal: productos y variantes asignados, última actualización.
   */
  async getSyncStats({ params, response }: HttpContext) {
    const channelId = Number(params.channel_id)
    if (Number.isNaN(channelId)) {
      return response.badRequest({
        success: false,
        message: 'channel_id debe ser un número',
        data: null,
        meta: { timestamp: new Date().toISOString() },
      })
    }

    const channel = await Channel.find(channelId)
    if (!channel) {
      return response.notFound({
        success: false,
        message: `Canal no encontrado: ${channelId}`,
        data: null,
        meta: { timestamp: new Date().toISOString() },
      })
    }

    const [productsCountResult, lastUpdatedRow, productIdsRows] = await Promise.all([
      ChannelProduct.query().where('channel_id', channelId).count('* as total').first(),
      ChannelProduct.query()
        .where('channel_id', channelId)
        .orderBy('updated_at', 'desc')
        .select('id', 'updated_at')
        .first(),
      ChannelProduct.query()
        .where('channel_id', channelId)
        .select('product_id'),
    ])

    const productsCount = Number((productsCountResult as { $extras?: { total?: number } })?.$extras?.total ?? 0)
    const productIds = productIdsRows.map((r) => r.product_id)
    let variantsCount = 0
    if (productIds.length > 0) {
      const variantsResult = await Variant.query()
        .whereIn('product_id', productIds)
        .count('* as total')
        .first()
      variantsCount = Number((variantsResult as { $extras?: { total?: number } })?.$extras?.total ?? 0)
    }

    const lastUpdated = lastUpdatedRow?.updatedAt
    const lastSyncedAt =
      lastUpdated != null
        ? typeof lastUpdated === 'string'
          ? lastUpdated
          : (lastUpdated as { toISO?: () => string }).toISO?.() ?? null
        : null

    return response.ok({
      success: true,
      message: 'Estadísticas de sincronización',
      data: {
        channelId,
        channelName: channel.name,
        productsCount,
        variantsCount,
        lastSyncedAt,
      },
      meta: { timestamp: new Date().toISOString() },
    })
  }
}
