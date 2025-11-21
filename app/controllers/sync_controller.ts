import env from '#start/env'
import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'
import CategoryService from '#services/categories_service'
import BrandService from '#services/brands_service'
import Channel from '#models/channel'
import { channels as channelsConfig } from '#utils/channels/channels'
import CompleteSyncService from '#services/complete_sync_service'
import { channelIdentifierValidator } from '#validators/channel_identifier_validator'
import PacksService from '#services/packs_service'

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
      let brand: string | undefined
      let country: string | undefined

      if (identifier.type === 'id') {
        const channel = await Channel.query().where('id', identifier.value).first()

        if (!channel) {
          this.logger.error(`Canal no encontrado con ID: ${identifier.value}`)
          return response.notFound({
            success: false,
            message: `Canal no encontrado con ID: ${identifier.value}`,
            data: null,
            meta: {
              timestamp: new Date().toISOString(),
              originalInput: channelIdentifier,
              validatedInput: identifier.value,
              suggestion: 'Verifica que el ID del canal exista en la base de datos',
            },
          })
        }

        channelId = channel.id
        channelName = channel.name
        brand = channelName
        country = env.get('COUNTRY_CODE')
        channelConfig = (channelsConfig as any)[brand]?.[country]
      } else {
        const channel = await Channel.query().where('name', identifier.value).first()

        if (!channel) {
          this.logger.error(`Canal no encontrado con nombre: ${identifier.value}`)
          return response.notFound({
            success: false,
            message: `Canal no encontrado con nombre: ${identifier.value}`,
            data: null,
            meta: {
              timestamp: new Date().toISOString(),
              originalInput: channelIdentifier,
              validatedInput: identifier.value,
              suggestion: 'Verifica que el nombre del canal exista en la base de datos',
            },
          })
        }

        channelId = channel.id
        channelName = channel.name
        brand = channelName
        country = env.get('COUNTRY_CODE')
        channelConfig = (channelsConfig as any)[brand]?.[country]
      }

      if (!channelConfig) {
        return response.badRequest({
          success: false,
          message: `Configuración no encontrada para el canal: ${channelName} en país ${country}`,
          data: null,
          meta: {
            timestamp: new Date().toISOString(),
            channelName,
            brand,
            country,
            suggestion: `Verifica que la marca ${brand} esté configurada para el país ${country} en channels.ts`,
          },
        })
      }

      const completeSyncService = new CompleteSyncService(channelConfig)
      const syncResult = await completeSyncService.syncProductsComplete()
      const packsService = new PacksService(channelConfig)
      await packsService
        .syncPacks()
        .then(() => this.logger.info('Packs OK'))
        .catch((err) => this.logger.error('Packs fail', err))

      return response.ok({
        success: syncResult?.success,
        message: syncResult?.message,
        data: syncResult?.data || null,
        meta: {
          timestamp: new Date().toISOString(),
          channelId,
          channelName,
          country,
        },
      })
    } catch (error) {
      if (error.messages) {
        this.logger.error(
          `Error de validación en identificador de canal: ${channelIdentifier}`,
          error.messages
        )
        return response.badRequest({
          success: false,
          message: 'Formato de identificador de canal inválido',
          data: null,
          errors: error.messages,
          meta: {
            timestamp: new Date().toISOString(),
            input: channelIdentifier,
            expectedFormats: [
              'channel_id numérico (ej: 1, 1420393)',
              'nombre de canal MARCA (ej: UF, FC, AF)',
            ],
            examples: [
              '/api/sincronizar-productos/1',
              '/api/sincronizar-productos/1420393',
              '/api/sincronizar-productos/UF',
              '/api/sincronizar-productos/FC',
              '/api/sincronizar-productos/AF',
            ],
          },
        })
      }

      if (error.message && error.message.includes('identificador debe ser')) {
        this.logger.error(
          `Formato inválido de identificador de canal: ${channelIdentifier}`,
          error.message
        )
        return response.badRequest({
          success: false,
          message: 'Formato de identificador de canal inválido',
          data: null,
          errors: [
            {
              field: 'channel_id',
              message: error.message,
              code: 'INVALID_FORMAT',
            },
          ],
          meta: {
            timestamp: new Date().toISOString(),
            input: channelIdentifier,
            expectedFormats: [
              'channel_id numérico (ej: 1, 1420393)',
              'nombre de canal MARCA (ej: UF, FC, AF)',
            ],
            examples: [
              '/api/sincronizar-productos/1',
              '/api/sincronizar-productos/1420393',
              '/api/sincronizar-productos/UF',
              '/api/sincronizar-productos/FC',
              '/api/sincronizar-productos/AF',
            ],
          },
        })
      }

      this.logger.error(`Error en sincronización de productos ${channelIdentifier}:`, error)
      throw error
    }
  }

  async syncCategories({ response }: HttpContext) {
    const result = await this.categoryService.syncCategories()

    return response.ok({
      success: true,
      message: result.message,
      data: result.data,
      meta: {
        timestamp: new Date().toISOString(),
      },
    })
  }

  async syncBrands({ response }: HttpContext) {
    try {
      const result = await this.brandService.syncBrands()

      return response.ok({
        success: result.success,
        message: result.message,
        data: result.data,
        meta: {
          timestamp: new Date().toISOString(),
          ...result.meta,
        },
        errors: result.errors,
      })
    } catch (error) {
      this.logger.error('Error en sincronización de marcas:', error)
      throw error
    }
  }

  async syncChannels({ response }: HttpContext) {
    try {
      const countryCode = env.get('COUNTRY_CODE')

      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
        countryCode,
      }

      for (const [brandName, countries] of Object.entries(channelsConfig)) {
        const countryConfig = (countries as Record<string, any>)[countryCode]
        if (!countryConfig) {
          this.logger.error(`No hay configuración para ${brandName} en ${countryCode}`)
          continue
        }

        try {
          const channelId = countryConfig.CHANNEL
          const channelName = brandName

          const channel = await Channel.updateOrCreate(
            { id: channelId },
            {
              id: channelId,
              name: channelName,
            }
          )

          if (channel.$isNew) {
            results.created++
          } else {
            results.updated++
          }
        } catch (error) {
          const errorMsg = `Error procesando ${brandName} para ${countryCode}: ${error.message}`
          results.errors.push(errorMsg)
          this.logger.error(`${errorMsg}`)
        }
      }

      return response.ok({
        success: true,
        message: 'Sincronización de canales completada exitosamente',
        data: results,
        meta: {
          timestamp: new Date().toISOString(),
          totalProcessed: results.created + results.updated + results.errors.length,
        },
      })
    } catch (error) {
      this.logger.error('Error en sincronización de canales:', error)
      throw error
    }
  }
}
