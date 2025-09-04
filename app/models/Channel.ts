import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import ChannelProduct from './channel_product.js'

export default class Channel extends BaseModel {
  public static table = 'channels'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => ChannelProduct, {
    foreignKey: 'channel_id',
  })
  declare products: HasMany<typeof ChannelProduct>

  // ✅ HELPERS ADICIONALES
  async getProducts() {
    try {
      return await ChannelProduct.query()
        .where('channel_id', this.id)
        .preload('product')
        .orderBy('product_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo productos del canal:', error)
      throw error
    }
  }

  async getProductsCount(): Promise<number> {
    try {
      return await ChannelProduct.query()
        .where('channel_id', this.id)
        .count('* as total')
        .first()
        .then((result) => result?.$extras.total || 0)
    } catch (error) {
      console.error('❌ Error contando productos del canal:', error)
      return 0
    }
  }

  async addProduct(productId: number) {
    try {
      return await ChannelProduct.updateOrCreate(
        { channel_id: this.id, product_id: productId },
        { channel_id: this.id, product_id: productId }
      )
    } catch (error) {
      console.error('❌ Error agregando producto al canal:', error)
      throw error
    }
  }

  async removeProduct(productId: number) {
    try {
      return await ChannelProduct.query()
        .where('channel_id', this.id)
        .where('product_id', productId)
        .delete()
    } catch (error) {
      console.error('❌ Error removiendo producto del canal:', error)
      throw error
    }
  }

  // ✅ MÉTODOS ESTÁTICOS ADICIONALES
  static async getChannelsWithProducts() {
    try {
      return await Channel.query()
        .whereHas('products', (query) => {
          query.where('id', '>', 0)
        })
        .orderBy('name', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo canales con productos:', error)
      throw error
    }
  }

  static async getChannelByName(name: string) {
    try {
      return await Channel.query().where('name', 'ilike', `%${name}%`).first()
    } catch (error) {
      console.error('❌ Error obteniendo canal por nombre:', error)
      throw error
    }
  }
}
