import { HttpContext } from '@adonisjs/core/http'
import Channel from '#models/channel'
import Logger from '@adonisjs/core/services/logger'
import { channels as channelsConfig } from '#utils/channels/channels'
import { channelNameValidator } from '#validators/channel_name_validator'
import env from '#start/env'

export default class ChannelsController {
  private readonly logger = Logger.child({ service: 'ChannelsController' })

  /**
   * Obtiene todos los canales
   */
  async index({ response }: HttpContext) {
    this.logger.info('🔍 GET /channels - Obteniendo todos los canales...')

    try {
      const channels = await Channel.query().orderBy('id', 'asc')

      this.logger.info(`✅ Canales obtenidos exitosamente: ${channels.length} canales`)

      return response.ok({
        success: true,
        data: channels,
        meta: {
          timestamp: new Date().toISOString(),
          total: channels.length,
        },
      })
    } catch (error) {
      this.logger.error('❌ Error obteniendo canales:', error)
      throw error
    }
  }

  /**
   * Sincroniza los canales desde el archivo de configuració   * Solo sincroniza los canales del país configurado en COUNTRY_CODE
   */
  async sync({ response }: HttpContext) {
    this.logger.info('🔄 POST /channels/sync - Iniciando sincronización de canales...')

    try {
      // 🎯 Obtener el país configurado
      const countryCode = env.get('COUNTRY_CODE')
      this.logger.info(`🌍 País configurado: ${countryCode}`)

      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
        countryCode,
      }

      // 🚀 Iterar sobre cada marca (UF, FC, AF, etc.)
      for (const [brandName, countries] of Object.entries(channelsConfig)) {
        this.logger.info(`📦 Procesando marca: ${brandName}`)

        // 🎯 Solo procesar el país configurado
        const countryConfig = (countries as Record<string, any>)[countryCode]
        if (!countryConfig) {
          this.logger.warn(`⚠️ No hay configuración para ${brandName} en ${countryCode}`)
          continue
        }

        try {
          const channelId = countryConfig.CHANNEL
          const channelName = brandName // Solo la marca, sin el país

          this.logger.info(
            `🌍 Procesando canal: ${channelName} (ID: ${channelId}) para país ${countryCode}`
          )

          // ✅ Usar updateOrCreate con el channel_id como id
          const channel = await Channel.updateOrCreate(
            { id: channelId }, // Buscar por id (que será el channel_id)
            {
              id: channelId, // El id será el channel_id
              name: channelName, // Solo la marca
            }
          )

          if (channel.$isNew) {
            results.created++
            this.logger.info(
              `✅ Canal creado: ${channelName} (ID: ${channelId}) para país ${countryCode}`
            )
          } else {
            results.updated++
            this.logger.info(
              `🔄 Canal actualizado: ${channelName} (ID: ${channelId}) para país ${countryCode}`
            )
          }
        } catch (error) {
          const errorMsg = `Error procesando ${brandName} para ${countryCode}: ${error.message}`
          results.errors.push(errorMsg)
          this.logger.error(`❌ ${errorMsg}`)
        }
      }

      // ✅ Logging del resultado final
      this.logger.info(`✅ Sincronización de canales completada`)
      this.logger.info(
        `📊 Resultados: ${results.created} creados, ${results.updated} actualizados, ${results.errors.length} errores`
      )

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
      this.logger.error('❌ Error en sincronización de canales:', error)
      throw error
    }
  }

  /**
   * Obtiene un canal por ID
   */
  async show({ params, response }: HttpContext) {
    const { id } = params
    this.logger.info(`🔍 GET /channels/${id} - Obteniendo canal por ID...`)

    try {
      const channel = await Channel.find(id)

      if (!channel) {
        this.logger.warn(`⚠️ Canal no encontrado con ID: ${id}`)
        return response.notFound({
          success: false,
          message: 'Canal no encontrado',
          data: null,
        })
      }

      this.logger.info(`✅ Canal obtenido exitosamente: ID ${id}`)

      return response.ok({
        success: true,
        data: channel,
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.logger.error(`❌ Error obteniendo canal ${id}:`, error)
      throw error
    }
  }

  /**
   * Obtiene un canal por nombre
   */
  async showByName({ params, response }: HttpContext) {
    const { name } = params
    this.logger.info(`🔍 GET /channels/name/${name} - Obteniendo canal por nombre...`)

    try {
      // 🎯 Validar el formato del nombre del canal
      const validatedData = await channelNameValidator.validate({ name })
      const validatedName = validatedData.name

      this.logger.info(`✅ Nombre validado: ${name} → ${validatedName}`)

      // 🔍 Buscar el canal con el nombre validado (en mayúsculas)
      const channel = await Channel.query().where('name', validatedName).first()

      if (!channel) {
        this.logger.warn(`⚠️ Canal no encontrado con nombre: ${validatedName}`)
        return response.notFound({
          success: false,
          message: `Canal no encontrado con nombre: ${validatedName}`,
          data: null,
          meta: {
            timestamp: new Date().toISOString(),
            originalInput: name,
            validatedInput: validatedName,
          },
        })
      }

      this.logger.info(`✅ Canal obtenido exitosamente: ${validatedName}`)

      return response.ok({
        success: true,
        data: channel,
        meta: {
          timestamp: new Date().toISOString(),
          originalInput: name,
          validatedInput: validatedName,
        },
      })
    } catch (error) {
      // 🚨 Si es error de validación, retornar mensaje descriptivo
      if (error.messages) {
        this.logger.warn(`⚠️ Error de validación en nombre de canal: ${name}`, error.messages)
        return response.badRequest({
          success: false,
          message: 'Formato de nombre de canal inválido',
          data: null,
          errors: error.messages,
          meta: {
            timestamp: new Date().toISOString(),
            input: name,
            expectedFormat: 'MARCA_PAIS (ej: UF_CL, FC_CL, AF_CL)',
          },
        })
      }

      // 🚨 Si es error de transformación (formato inválido), retornar 400
      if (error.message && error.message.includes('estructura MARCA_PAIS')) {
        this.logger.warn(`⚠️ Formato inválido de nombre de canal: ${name}`, error.message)
        return response.badRequest({
          success: false,
          message: 'Formato de nombre de canal inválido',
          data: null,
          errors: [
            {
              field: 'name',
              message: error.message,
              code: 'INVALID_FORMAT',
            },
          ],
          meta: {
            timestamp: new Date().toISOString(),
            input: name,
            expectedFormat: 'MARCA_PAIS (ej: UF_CL, FC_CL, AF_CL)',
          },
        })
      }

      this.logger.error(`❌ Error obteniendo canal ${name}:`, error)
      throw error
    }
  }

  /**
   * Obtiene canales con productos
   */
  async withProducts({ response }: HttpContext) {
    this.logger.info('🔍 GET /channels/with-products - Obteniendo canales con productos...')

    try {
      const channels = await Channel.getChannelsWithProducts()

      this.logger.info(`✅ Canales con productos obtenidos: ${channels.length} canales`)

      return response.ok({
        success: true,
        data: channels,
        meta: {
          timestamp: new Date().toISOString(),
          total: channels.length,
        },
      })
    } catch (error) {
      this.logger.error('❌ Error obteniendo canales con productos:', error)
      throw error
    }
  }
}
