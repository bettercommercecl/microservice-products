import { HttpContext } from '@adonisjs/core/http'
import Channel from '#models/channel'
import Logger from '@adonisjs/core/services/logger'
import { channelNameValidator } from '#validators/channel_name_validator'

export default class ChannelsController {
  private readonly logger = Logger.child({ service: 'ChannelsController' })

  /**
   * Obtiene todos los canales
   */
  async index({ response }: HttpContext) {
    try {
      const channels = await Channel.query().orderBy('id', 'asc')

      return response.ok({
        success: true,
        data: channels,
        meta: {
          timestamp: new Date().toISOString(),
          total: channels.length,
        },
      })
    } catch (error) {
      this.logger.error('Error obteniendo canales:', error)
      throw error
    }
  }

  /**
   * Obtiene un canal por ID
   */
  async show({ params, response }: HttpContext) {
    const { id } = params

    try {
      const channel = await Channel.find(id)

      if (!channel) {
        this.logger.error(`Canal no encontrado con ID: ${id}`)
        return response.notFound({
          success: false,
          message: 'Canal no encontrado',
          data: null,
        })
      }

      return response.ok({
        success: true,
        data: channel,
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    } catch (error) {
      this.logger.error(`Error obteniendo canal ${id}:`, error)
      throw error
    }
  }

  /**
   * Obtiene un canal por nombre
   */
  async showByName({ params, response }: HttpContext) {
    const { name } = params

    try {
      // Validar el formato del nombre del canal
      const validatedData = await channelNameValidator.validate({ name })
      const validatedName = validatedData.name

      // Buscar el canal con el nombre validado (en mayúsculas)
      const channel = await Channel.query().where('name', validatedName).first()

      if (!channel) {
        this.logger.error(`Canal no encontrado con nombre: ${validatedName}`)
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
        this.logger.error(`Error de validación en nombre de canal: ${name}`, error.messages)
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
        this.logger.error(`Formato inválido de nombre de canal: ${name}`, error.message)
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

      this.logger.error(`Error obteniendo canal ${name}:`, error)
      throw error
    }
  }

  /**
   * Obtiene canales con productos
   */
  async withProducts({ response }: HttpContext) {
    try {
      const channels = await Channel.getChannelsWithProducts()

      return response.ok({
        success: true,
        data: channels,
        meta: {
          timestamp: new Date().toISOString(),
          total: channels.length,
        },
      })
    } catch (error) {
      this.logger.error('Error obteniendo canales con productos:', error)
      throw error
    }
  }
}
