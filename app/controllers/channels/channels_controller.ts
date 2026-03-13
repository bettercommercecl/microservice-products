import { HttpContext } from '@adonisjs/core/http'
import ChannelsService from '#services/channels_service'
import Logger from '@adonisjs/core/services/logger'
import {
  createChannelValidator,
  updateChannelValidator,
} from '#validators/channel_validator'
import { channelNameValidator } from '#validators/channel_name_validator'

export default class ChannelsController {
  private readonly logger = Logger.child({ service: 'ChannelsController' })
  private readonly channelsService = new ChannelsService()

  async index({ response }: HttpContext) {
    try {
      const channels = await this.channelsService.getAll()
      return response.ok({
        success: true,
        data: channels,
        meta: { timestamp: new Date().toISOString(), total: channels.length },
      })
    } catch (error) {
      this.logger.error('Error obteniendo canales:', error)
      throw error
    }
  }

  async show({ params, response }: HttpContext) {
    const id = Number(params.id)
    try {
      const channel = await this.channelsService.getById(id)
      if (!channel) {
        return response.notFound({
          success: false,
          message: 'Canal no encontrado',
          data: null,
        })
      }
      return response.ok({
        success: true,
        data: channel,
        meta: { timestamp: new Date().toISOString() },
      })
    } catch (error) {
      this.logger.error(`Error obteniendo canal ${id}:`, error)
      throw error
    }
  }

  async showByName({ params, response }: HttpContext) {
    const { name } = params
    try {
      const validatedData = await channelNameValidator.validate({ name })
      const channel = await this.channelsService.getByName(validatedData.name)
      if (!channel) {
        return response.notFound({
          success: false,
          message: `Canal no encontrado con nombre: ${validatedData.name}`,
          data: null,
          meta: { originalInput: name, validatedInput: validatedData.name },
        })
      }
      return response.ok({
        success: true,
        data: channel,
        meta: { originalInput: name, validatedInput: validatedData.name },
      })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          success: false,
          message: 'Formato de nombre de canal inválido',
          data: null,
          errors: error.messages,
          meta: { input: name, expectedFormat: 'MARCA_PAIS (ej: UF_CL, FC_CL)' },
        })
      }
      if (error.message?.includes('estructura MARCA_PAIS')) {
        return response.badRequest({
          success: false,
          message: 'Formato de nombre de canal inválido',
          data: null,
          errors: [{ field: 'name', message: error.message, code: 'INVALID_FORMAT' }],
          meta: { input: name, expectedFormat: 'MARCA_PAIS (ej: UF_CL, FC_CL)' },
        })
      }
      this.logger.error(`Error obteniendo canal ${name}:`, error)
      throw error
    }
  }

  async withProducts({ response }: HttpContext) {
    try {
      const channels = await this.channelsService.getWithProducts()
      return response.ok({
        success: true,
        data: channels,
        meta: { timestamp: new Date().toISOString(), total: channels.length },
      })
    } catch (error) {
      this.logger.error('Error obteniendo canales con productos:', error)
      throw error
    }
  }

  async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createChannelValidator)
      const channel = await this.channelsService.create({
        id: payload.id,
        name: payload.name,
        tree_id: payload.tree_id,
        parent_category: payload.parent_category,
      })
      return response.created({
        success: true,
        message: 'Canal creado',
        data: channel,
        meta: { timestamp: new Date().toISOString() },
      })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          success: false,
          message: 'Datos inválidos',
          data: null,
          errors: error.messages,
        })
      }
      this.logger.error('Error creando canal:', error)
      throw error
    }
  }

  async update({ params, request, response }: HttpContext) {
    const id = Number(params.id)
    try {
      const payload = await request.validateUsing(updateChannelValidator)
      const channel = await this.channelsService.update(id, payload)
      if (!channel) {
        return response.notFound({
          success: false,
          message: 'Canal no encontrado',
          data: null,
        })
      }
      return response.ok({
        success: true,
        message: 'Canal actualizado',
        data: channel,
        meta: { timestamp: new Date().toISOString() },
      })
    } catch (error) {
      if (error.messages) {
        return response.badRequest({
          success: false,
          message: 'Datos inválidos',
          data: null,
          errors: error.messages,
        })
      }
      this.logger.error(`Error actualizando canal ${id}:`, error)
      throw error
    }
  }

  async destroy({ params, response }: HttpContext) {
    const id = Number(params.id)
    try {
      const deleted = await this.channelsService.delete(id)
      if (!deleted) {
        return response.notFound({
          success: false,
          message: 'Canal no encontrado',
          data: null,
        })
      }
      return response.ok({
        success: true,
        message: 'Canal eliminado',
        data: { id },
        meta: { timestamp: new Date().toISOString() },
      })
    } catch (error) {
      this.logger.error(`Error eliminando canal ${id}:`, error)
      throw error
    }
  }
}
