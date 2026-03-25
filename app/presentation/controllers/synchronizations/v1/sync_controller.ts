import env from '#start/env'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'
import CategoryService from '#services/categories_service'
import BrandService from '#services/brands_service'
import CacheService from '#services/cache_service'
import Channel from '#models/channel'
import { channels as channelsConfig } from '#utils/channels/channels'
import ChannelProductSyncService from '#services/channel_product_sync_service'
import BigcommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import ChannelFormatProductsService from '#services/channel_format_products_service'
import FormatVariantsService from '#services/format_variants_service'
import FormatOptionsService from '#services/format_options_service'
import FiltersService from '#services/filters_service'
import InventoryService from '#services/inventory_service'
import ChannelsService from '#services/channels_service'
import ProductService from '#services/product_service'
import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import ProductRepository from '#infrastructure/persistence/repositories/product_repository'
import { channelIdentifierValidator } from '#validators/channel_identifier_validator'
import PacksService from '#services/packs_service'
import ChannelRepository from '#infrastructure/persistence/repositories/channel_repository'
import SyncChannelsFromConfigUseCase from '#application/use_cases/channels/sync_channels_from_config_use_case'

/**
 * Sincronizaciones v1 (legacy): sync por canal, categorias, marcas, canales.
 */
export default class SyncController {
  private readonly logger = Logger.child({ service: 'SyncController' })
  private categoryService: CategoryService
  private brandService: BrandService

  constructor() {
    this.categoryService = new CategoryService()
    this.brandService = new BrandService()
  }

  async syncProducts({ params, response }: HttpContext) {
    const { channel_id: channelIdentifier } = params

    try {
      const validatedData = await channelIdentifierValidator.validate({
        channel_id: channelIdentifier,
      })
      const { channel_id: identifier } = validatedData

      let channelId: number
      let channelName: string | undefined
      let channelConfig: any = null
      const country = env.get('COUNTRY_CODE')

      if (identifier.type === 'id') {
        const channel = await Channel.query().where('id', identifier.value).first()
        if (!channel) {
          this.logger.error(`Canal no encontrado con ID: ${identifier.value}`)
          return response.notFound({
            success: false,
            message: `Canal no encontrado con ID: ${identifier.value}`,
            data: null,
            meta: { timestamp: new Date().toISOString(), originalInput: channelIdentifier },
          })
        }
        channelId = channel.id
        channelName = channel.name
        channelConfig = (channelsConfig as any)[channelName]?.[country]
      } else {
        const channel = await Channel.query().where('name', identifier.value).first()
        if (!channel) {
          this.logger.error(`Canal no encontrado con nombre: ${identifier.value}`)
          return response.notFound({
            success: false,
            message: `Canal no encontrado con nombre: ${identifier.value}`,
            data: null,
            meta: { timestamp: new Date().toISOString(), originalInput: channelIdentifier },
          })
        }
        channelId = channel.id
        channelName = channel.name
        channelConfig = (channelsConfig as any)[channelName]?.[country]
      }

      if (!channelConfig) {
        return response.badRequest({
          success: false,
          message: `Configuracion no encontrada para el canal: ${channelName} en pais ${country}`,
          data: null,
          meta: { timestamp: new Date().toISOString(), channelName, country },
        })
      }

      const bigcommerceService = new BigcommerceService()
      const channelSyncService = new ChannelProductSyncService(channelConfig, {
        bigcommerceService,
        productService: new ProductService({
          cache: new CacheService(),
          bigCommerce: bigcommerceService,
          calculation: new CalculationAdapter(),
          productRepository: new ProductRepository(),
        }),
        formatProductsService: new ChannelFormatProductsService({
          calculation: new CalculationAdapter(),
        }),
        formatVariantsService: new FormatVariantsService({
          calculation: new CalculationAdapter(),
        }),
        formatOptionsService: new FormatOptionsService(),
        filtersService: new FiltersService(),
        categoryService: new CategoryService(),
        inventoryService: new InventoryService(),
        channelsService: new ChannelsService(),
      })
      const syncResult = await channelSyncService.syncProductsComplete()
      const packsService = new PacksService(channelConfig)
      await packsService
        .syncPacks()
        .then(() => this.logger.info('Packs OK'))
        .catch((err) => this.logger.error('Packs fail', err))

      return response.ok({
        success: syncResult?.success,
        message: syncResult?.message,
        data: syncResult?.data || null,
        meta: { timestamp: new Date().toISOString(), channelId, channelName, country },
      })
    } catch (error: any) {
      if (error.messages) {
        this.logger.error(
          `Error de validacion en identificador de canal: ${channelIdentifier}`,
          error.messages
        )
        return response.badRequest({
          success: false,
          message: 'Formato de identificador de canal invalido',
          data: null,
          errors: error.messages,
          meta: { timestamp: new Date().toISOString(), input: channelIdentifier },
        })
      }
      if (error.message?.includes('identificador debe ser')) {
        return response.badRequest({
          success: false,
          message: 'Formato de identificador de canal invalido',
          data: null,
          meta: { timestamp: new Date().toISOString(), input: channelIdentifier },
        })
      }
      this.logger.error(`Error en sincronizacion de productos ${channelIdentifier}:`, error)
      throw error
    }
  }

  async syncCategories({ response }: HttpContext) {
    const result = await this.categoryService.syncCategories()
    return response.ok({
      success: true,
      message: result.message,
      data: result.data,
      meta: { timestamp: new Date().toISOString() },
    })
  }

  async syncBrands({ response }: HttpContext) {
    try {
      const result = await this.brandService.syncBrands()
      return response.ok({
        success: result.success,
        message: result.message,
        data: result.data,
        meta: { timestamp: new Date().toISOString(), ...result.meta },
        errors: result.errors,
      })
    } catch (error: any) {
      this.logger.error('Error en sincronizacion de marcas:', error)
      throw error
    }
  }

  async syncChannels({ response }: HttpContext) {
    try {
      const countryCode = env.get('COUNTRY_CODE')
      const useCase = new SyncChannelsFromConfigUseCase(new ChannelRepository())
      const result = await useCase.execute(countryCode)

      return response.ok({
        success: true,
        message: 'Sincronizacion de canales completada',
        data: result,
        meta: {
          timestamp: new Date().toISOString(),
          totalProcessed: result.createdOrUpdated + result.skipped,
        },
      })
    } catch (error: any) {
      this.logger.error('Error en sincronizacion de canales:', error)
      throw error
    }
  }
}
