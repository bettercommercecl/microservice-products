import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Channel from './channel.js'
import Product from './product.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ChannelProduct extends BaseModel {
  public static table = 'channel_product'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare channel_id: number

  @column()
  declare product_id: number

  @belongsTo(() => Channel, {
    foreignKey: 'channel_id',
  })
  declare channel: BelongsTo<typeof Channel>

  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  /**
   * 📦 Obtiene todos los productos de un canal específico
   * @param channelId - ID del canal
   * @returns Promise<ChannelProduct[]> - Lista de productos del canal con preload
   */
  static async getProductsByChannel(channelId: number) {
    try {
      return await ChannelProduct.query()
        .where('channel_id', channelId)
        .preload('product')
        .orderBy('product_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo productos del canal:', error)
      throw error
    }
  }

  /**
   * 🔢 Cuenta el total de productos en un canal
   * @param channelId - ID del canal
   * @returns Promise<number> - Número total de productos
   */
  static async getProductsCountByChannel(channelId: number): Promise<number> {
    try {
      return await ChannelProduct.query()
        .where('channel_id', channelId)
        .count('* as total')
        .first()
        .then((result) => result?.$extras.total || 0)
    } catch (error) {
      console.error('❌ Error contando productos del canal:', error)
      return 0
    }
  }

  /**
   * ➕ Asigna un producto a un canal
   * @param channelId - ID del canal
   * @param productId - ID del producto
   * @returns Promise<ChannelProduct> - Relación creada o actualizada
   */
  static async assignProductToChannel(channelId: number, productId: number) {
    try {
      return await ChannelProduct.updateOrCreate(
        { channel_id: channelId, product_id: productId },
        { channel_id: channelId, product_id: productId }
      )
    } catch (error) {
      console.error('❌ Error asignando producto al canal:', error)
      throw error
    }
  }

  /**
   * ➖ Remueve un producto de un canal
   * @param channelId - ID del canal
   * @param productId - ID del producto
   * @returns Promise<number> - Número de registros eliminados
   */
  static async removeProductFromChannel(channelId: number, productId: number) {
    try {
      return await ChannelProduct.query()
        .where('channel_id', channelId)
        .where('product_id', productId)
        .delete()
    } catch (error) {
      console.error('❌ Error removiendo producto del canal:', error)
      throw error
    }
  }

  /**
   * 🔄 Sincroniza productos de un canal (elimina existentes y crea nuevos)
   * @param channelId - ID del canal
   * @param productIds - Array de IDs de productos
   * @returns Promise<boolean> - true si la sincronización fue exitosa
   */
  static async syncProductsForChannel(channelId: number, productIds: number[]) {
    try {
      // Eliminar productos existentes del canal
      await ChannelProduct.query().where('channel_id', channelId).delete()

      // Crear nuevas relaciones si hay productos
      if (productIds.length > 0) {
        const relationsToCreate = productIds.map((productId) => ({
          channel_id: channelId,
          product_id: productId,
        }))

        await ChannelProduct.createMany(relationsToCreate)
      }

      return true
    } catch (error) {
      console.error('❌ Error sincronizando productos del canal:', error)
      throw error
    }
  }

  /**
   * 📋 Obtiene canales donde está asignado un producto
   * @param productId - ID del producto
   * @returns Promise<ChannelProduct[]> - Lista de canales con preload
   */
  static async getChannelsByProduct(productId: number) {
    try {
      return await ChannelProduct.query()
        .where('product_id', productId)
        .preload('channel')
        .orderBy('channel_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo canales del producto:', error)
      throw error
    }
  }

  /**
   * 🔍 Verifica si un producto está asignado a un canal
   * @param channelId - ID del canal
   * @param productId - ID del producto
   * @returns Promise<boolean> - true si está asignado, false si no
   */
  static async isProductInChannel(channelId: number, productId: number): Promise<boolean> {
    try {
      const relation = await ChannelProduct.query()
        .where('channel_id', channelId)
        .where('product_id', productId)
        .first()

      return !!relation
    } catch (error) {
      console.error('❌ Error verificando asignación producto-canal:', error)
      return false
    }
  }

  /**
   * 📊 Obtiene estadísticas de productos por canal
   * @param channelId - ID del canal
   * @returns Promise<object> - Estadísticas del canal
   */
  static async getChannelStats(channelId: number) {
    try {
      const totalProducts = await ChannelProduct.query()
        .where('channel_id', channelId)
        .count('* as total')
        .first()

      const visibleProducts = await ChannelProduct.query()
        .where('channel_id', channelId)
        .whereHas('product', (query) => {
          query.where('is_visible', true)
        })
        .count('* as total')
        .first()

      return {
        totalProducts: totalProducts?.$extras.total || 0,
        visibleProducts: visibleProducts?.$extras.total || 0,
        hiddenProducts: (totalProducts?.$extras.total || 0) - (visibleProducts?.$extras.total || 0),
      }
    } catch (error) {
      console.error('❌ Error obteniendo estadísticas del canal:', error)
      throw error
    }
  }
}
