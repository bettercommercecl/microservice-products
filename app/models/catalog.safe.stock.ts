import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './product.js'
import Variant from './variant.js'

export default class CatalogSafeStock extends BaseModel {
  protected tableName = 'catalog_safe_stock'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare product_id: number

  @column()
  declare sku: string

  @column()
  declare variant_id: number

  @column()
  declare safety_stock: number

  @column()
  declare warning_level: number

  @column()
  declare available_to_sell: number

  @column()
  declare bin_picking_number: string | null

  // RELACIONES FALTANTES
  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => Variant, {
    foreignKey: 'variant_id',
  })
  declare variant: BelongsTo<typeof Variant>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // HELPERS ADICIONALES
  async getProduct() {
    try {
      return await Product.query().where('id', this.product_id).first()
    } catch (error) {
      console.error('Error obteniendo producto del stock:', error)
      throw error
    }
  }

  async getVariant() {
    try {
      return await Variant.query().where('id', this.variant_id).first()
    } catch (error) {
      console.error('Error obteniendo variante del stock:', error)
      throw error
    }
  }

  async updateStock(availableToSell: number, safetyStock: number) {
    try {
      this.available_to_sell = availableToSell
      this.safety_stock = safetyStock
      await this.save()
      return this
    } catch (error) {
      console.error('Error actualizando stock:', error)
      throw error
    }
  }

  async isInStock(): Promise<boolean> {
    try {
      return this.available_to_sell > 0
    } catch (error) {
      console.error('Error verificando stock:', error)
      return false
    }
  }

  async isLowStock(): Promise<boolean> {
    try {
      return this.available_to_sell <= this.safety_stock
    } catch (error) {
      console.error('Error verificando stock bajo:', error)
      return false
    }
  }

  // MÉTODOS ESTÁTICOS ADICIONALES
  static async getStockBySku(sku: string) {
    try {
      return await CatalogSafeStock.query().where('sku', sku).first()
    } catch (error) {
      console.error('Error obteniendo stock por SKU:', error)
      throw error
    }
  }

  static async getStockByProductId(productId: number) {
    try {
      return await CatalogSafeStock.query()
        .where('product_id', productId)
        .preload('product')
        .preload('variant')
    } catch (error) {
      console.error('Error obteniendo stock por producto:', error)
      throw error
    }
  }

  static async getStockByVariantId(variantId: number) {
    try {
      return await CatalogSafeStock.query()
        .where('variant_id', variantId)
        .preload('product')
        .preload('variant')
        .first()
    } catch (error) {
      console.error('Error obteniendo stock por variante:', error)
      throw error
    }
  }

  static async getLowStockItems() {
    try {
      return await CatalogSafeStock.query()
        .whereRaw('available_to_sell <= safety_stock')
        .preload('product')
        .preload('variant')
        .orderBy('available_to_sell', 'asc')
    } catch (error) {
      console.error('Error obteniendo items con stock bajo:', error)
      throw error
    }
  }

  static async getOutOfStockItems() {
    try {
      return await CatalogSafeStock.query()
        .where('available_to_sell', 0)
        .preload('product')
        .preload('variant')
        .orderBy('sku', 'asc')
    } catch (error) {
      console.error('Error obteniendo items sin stock:', error)
      throw error
    }
  }

  static async bulkUpdateStock(stockUpdates: any[]) {
    try {
      const promises = stockUpdates.map((update) =>
        CatalogSafeStock.query().where('sku', update.sku).update({
          available_to_sell: update.available_to_sell,
          safety_stock: update.safety_stock,
        })
      )

      return await Promise.all(promises)
    } catch (error) {
      console.error('Error actualizando stock masivamente:', error)
      throw error
    }
  }
}
