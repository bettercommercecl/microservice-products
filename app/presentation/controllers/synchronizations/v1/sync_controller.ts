import SyncChannelsFromConfigUseCase from '#application/use_cases/channels/sync_channels_from_config_use_case'
import syncConfig from '#config/sync'
import CalculationAdapter from '#infrastructure/adapters/calculation_adapter'
import BigcommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import ChannelRepository from '#infrastructure/persistence/repositories/channel_repository'
import ProductRepository from '#infrastructure/persistence/repositories/product_repository'
import type { ChannelConfigInterface } from '#interfaces/channel_interface'
import Channel from '#models/channel'
import BrandService from '#services/brands_service'
import CacheService from '#services/cache_service'
import CategoryService from '#services/categories_service'
import ProductService from '#services/product_service'
import GlobalProductSyncService from '#services/synchronizations/global_product_sync_service'
import SyncWebhookNotifier from '#services/synchronizations/sync_webhook_notifier'
import env from '#start/env'
import { channels as channelsConfig } from '#utils/channels/channels'
import { channelIdentifierValidator } from '#validators/channel_identifier_validator'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

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
      let channelConfig: ChannelConfigInterface | null = null
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
        channelConfig =
          (channelsConfig as Record<string, Record<string, ChannelConfigInterface>>)[channelName]?.[
            country
          ] ?? null
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
        channelConfig =
          (channelsConfig as Record<string, Record<string, ChannelConfigInterface>>)[channelName]?.[
            country
          ] ?? null
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
      const productService = new ProductService({
        cache: new CacheService(),
        bigCommerce: bigcommerceService,
        calculation: new CalculationAdapter(),
        productRepository: new ProductRepository(),
      })
      const globalSyncService = new GlobalProductSyncService({
        calculation: new CalculationAdapter(),
        productService,
      })
      const syncResult = await globalSyncService.syncProductsComplete({
        channelId,
        channelConfig,
        channelName: channelName ?? String(channelId),
      })
      try {
        const cache = new CacheService()
        await cache.invalidateByPrefix(syncConfig.cacheInvalidationPrefixProducts)
      } catch (e: unknown) {
        this.logger.warn({ err: e }, 'Invalidacion de cache Redis omitida')
      }

      const hooks = new SyncWebhookNotifier()
      void hooks
        .notifyChannel(channelId, 'products_sync_completed', {
          success: !!syncResult?.success,
          source: 'standalone',
          message: 'Productos sincronizados para el canal',
        })
        .catch((err) => this.logger.error({ err }, 'Webhook products_sync_completed (canal)'))

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
    const hooks = new SyncWebhookNotifier()
    void hooks
      .notifyAllChannelsInCountry('categories_sync_completed', {
        success: true,
        source: 'standalone',
        message: 'Categorias sincronizadas',
      })
      .catch((err) => this.logger.error({ err }, 'Webhook categories_sync_completed'))

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
      const hooks = new SyncWebhookNotifier()
      void hooks
        .notifyAllChannelsInCountry('brands_sync_completed', {
          success: result.success,
          source: 'standalone',
          message: 'Marcas sincronizadas',
        })
        .catch((err) => this.logger.error({ err }, 'Webhook brands_sync_completed'))

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
