import { HttpContext } from '@adonisjs/core/http'
import ProductService from '#services/product_service'
import Logger from '@adonisjs/core/services/logger'
import vine from '@vinejs/vine'
import { productShowSchema } from '../validators/product_show_validator.js'
import { channelIdentifierValidator } from '#validators/channel_identifier_validator'
import Channel from '#models/channel'

import { channels as channelsConfig } from '#utils/channels/channels'
import CompleteSyncService from '#services/complete_sync_service'
import env from '#start/env'

export default class ProductsController {
  private productService: ProductService
  private readonly logger = Logger.child({ service: 'ProductsController' })

  constructor() {
    this.productService = new ProductService()
  }

  /**
   * Obtiene todos los productos
   */
  async index({ response }: HttpContext) {
    const products = await this.productService.getAllProducts()

    // Respuesta estándar usando Adonis 6 nativo
    return response.ok(products)
  }

  /**
   * Obtiene un producto por ID
   */
  async show({ params, response }: HttpContext) {
    // VALIDACIÓN CON VINEJS - Si falla, lanza error para el handler
    const validatedData = await vine.validate({
      schema: productShowSchema,
      data: params,
    })
    const { id: productId } = validatedData

    const product = await this.productService.getProductById(productId)

    if (!product || !product.data) {
      this.logger.error(`Producto no encontrado con ID: ${productId}`)
      throw new Error('Producto no encontrado')
    }

    // Solo respuesta de éxito - errores van al handler global
    return response.ok(product)
  }

  /**
   * Sincroniza los productos desde BigCommerce
   * Acepta tanto channel_id (número) como nombre de canal (MARCA_PAIS)
   */
  async sync({ params, response }: HttpContext) {
    const { channel_id: channelIdentifier } = params

    try {
      // Validar el identificador del canal (ID o nombre)
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
        // Es un channel_id numérico, buscar en BD para obtener el nombre
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

        // El nombre del canal ahora es solo la marca (ej: UF, FC, AF)
        brand = channelName
        country = env.get('COUNTRY_CODE') // Usar el país configurado
        channelConfig = (channelsConfig as any)[brand]?.[country]
      } else {
        // Es un nombre de canal, buscar el channel_id correspondiente
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

        // El nombre del canal ahora es solo la marca (ej: UF, FC, AF)
        brand = channelName
        country = env.get('COUNTRY_CODE') // Usar el país configurado
        channelConfig = (channelsConfig as any)[brand]?.[country]
      }

      // 🚨 Validar que se encontró la configuración del canal
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

      // Crear el servicio de sincronización completa con la configuración del canal
      const completeSyncService = new CompleteSyncService(channelConfig)

      // Ejecutar la sincronización completa
      const syncResult = await completeSyncService.syncProductsComplete()

      return response.ok({
        success: syncResult.success,
        message: syncResult.message,
        data: syncResult.data,
        meta: {
          timestamp: new Date().toISOString(),
          channelId,
          channelName,
          country,
        },
      })
    } catch (error) {
      // 🚨 Si es error de validación, retornar mensaje descriptivo
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

      // 🚨 Si es error de transformación (formato inválido), retornar 400
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

  /**
   * Obtener estadísticas de sincronización de un canal
   */
  async getSyncStats({ params, response }: HttpContext) {
    const { channel_id: channelId } = params

    try {
      // TODO: Implementar getSyncStats cuando sea necesario
      const stats = { message: 'Estadísticas no implementadas aún' }

      return response.ok({
        success: true,
        message: 'Estadísticas de sincronización obtenidas exitosamente',
        data: {
          channelId: Number(channelId),
          stats,
        },
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.logger.error(`Error obteniendo estadísticas de sincronización:`, error)
      throw error
    }
  }
}
