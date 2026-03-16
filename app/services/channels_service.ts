import Channel from '#models/channel'
import ChannelProduct from '#models/channel_product'
import Logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

export interface CreateChannelPayload {
  id: number
  name: string
  tree_id?: number | null
  parent_category?: number | null
}

export interface UpdateChannelPayload {
  name?: string
  tree_id?: number | null
  parent_category?: number | null
  country?: string | null
}

/**
 * Servicio de canales. El id coincide con channel_id de BigCommerce.
 */
export default class ChannelsService {
  private readonly logger = Logger.child({ service: 'ChannelsService' })

  async create(payload: CreateChannelPayload): Promise<Channel> {
    const country = env.get('COUNTRY_CODE')
    const channel = await Channel.updateOrCreate(
      { id: payload.id },
      {
        id: payload.id,
        name: payload.name,
        tree_id: payload.tree_id ?? null,
        parent_category: payload.parent_category ?? null,
        country: country,
      }
    )
    this.logger.info(`Canal creado: ${channel.id} - ${channel.name}`)
    return channel
  }

  async getAll(): Promise<Channel[]> {
    return Channel.query().orderBy('id', 'asc')
  }

  async getById(id: number): Promise<Channel | null> {
    return Channel.find(id)
  }

  async getByName(name: string): Promise<Channel | null> {
    return Channel.query().where('name', name).first()
  }

  async update(id: number, payload: UpdateChannelPayload): Promise<Channel | null> {
    const channel = await Channel.find(id)
    if (!channel) return null

    if (payload.name !== undefined) channel.name = payload.name
    if (payload.tree_id !== undefined) channel.tree_id = payload.tree_id
    if (payload.parent_category !== undefined) channel.parent_category = payload.parent_category
    if (payload.country !== undefined) channel.country = payload.country

    await channel.save()
    this.logger.info(`Canal actualizado: ${channel.id}`)
    return channel
  }

  async delete(id: number): Promise<boolean> {
    const channel = await Channel.find(id)
    if (!channel) return false

    await channel.delete()
    this.logger.info(`Canal eliminado: ${id}`)
    return true
  }

  async getWithProducts(): Promise<Channel[]> {
    return Channel.getChannelsWithProducts()
  }

  /**
   * Sincroniza relaciones canal-producto a partir de variantes formateadas (cada una con product_id).
   */
  async syncChannelByProduct(
    formattedVariants: { product_id: number }[],
    channelId: number,
    trx: TransactionClientContract
  ): Promise<void> {
    const productIds = [...new Set(formattedVariants.map((v) => v.product_id))]
    const allRelations = productIds.map((product_id) => ({ product_id, channel_id: channelId }))
    if (allRelations.length === 0) return
    await ChannelProduct.updateOrCreateMany(['channel_id', 'product_id'], allRelations, {
      client: trx,
    })
  }
}
