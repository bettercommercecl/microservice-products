import env from '#start/env'
import { ChannelConfigInterface } from '#interfaces/channel_interface'
import Logger from '@adonisjs/core/services/logger'
import axios from 'axios'
import Variant from '#models/variant'

interface PackItem {
  variant_id: number
  product_id: number
  sku: string
  stock: number
  reserve: string
  serial: string
}

export default class PacksService {
  private readonly logger = Logger.child({ service: 'PacksService' })
  private readonly channelConfig: ChannelConfigInterface

  constructor(channelDataConfig: ChannelConfigInterface) {
    this.channelConfig = channelDataConfig
    this.logger.info('PacksService initialized')
  }

  async getPacks(): Promise<PackItem[]> {
    try {
      this.logger.debug(
        {
          endpoint: `${this.channelConfig.API_URL}/api/packs`,
        },
        'PacksService - solicitando packs al canal externo'
      )
      const response = await axios.get(`${this.channelConfig.API_URL}/api/packs`, {
        headers: {
          'x-api-key': env.get('X_API_KEY'),
        },
      })
      return response.data
    } catch (error) {
      this.logger.error({ error }, 'Error obteniendo packs')
      throw error
    }
  }

  async updateVariantsStock(packItems: PackItem[]): Promise<void> {
    try {
      if (!Array.isArray(packItems) || packItems.length === 0) {
        this.logger.warn('PacksService - no hay items de packs para actualizar')
        return
      }

      const updates = packItems
        .filter((item) => Number.isFinite(item.variant_id))
        .map((item) => ({
          id: item.variant_id,
          stock: Number(item.stock) || 0,
        }))

      if (updates.length === 0) {
        this.logger.warn('PacksService - no hay variant_id válidos para actualizar')
        return
      }

      await Variant.updateOrCreateMany('id', updates)

      this.logger.info(
        {
          total: updates.length,
        },
        'PacksService - stock de variantes actualizado exitosamente'
      )
    } catch (error) {
      this.logger.error({ error }, 'Error al actualizar stock de variantes')
      throw error
    }
  }

  async syncPacks(): Promise<void> {
    try {
      const packItems = await this.getPacks()
      await this.updateVariantsStock(packItems)
      this.logger.info('PacksService - packs sincronizados exitosamente')
    } catch (error) {
      this.logger.error({ error }, 'Error al sincronizar los packs')
      throw new Error('Error al sincronizar los packs')
    }
  }
}
