import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import Product from './product.js'

export default class Brand extends BaseModel {
  public static table = 'brands'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @hasMany(() => Product)
  declare products: HasMany<typeof Product>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // ✅ HELPERS ADICIONALES
  async getProducts() {
    try {
      return await Product.query().where('brand_id', this.id).orderBy('name', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo productos de la marca:', error)
      throw error
    }
  }

  async getProductsCount(): Promise<number> {
    try {
      return await Product.query()
        .where('brand_id', this.id)
        .count('* as total')
        .first()
        .then((result) => result?.$extras.total || 0)
    } catch (error) {
      console.error('❌ Error contando productos de la marca:', error)
      return 0
    }
  }

  async getVisibleProducts() {
    try {
      return await Product.query()
        .where('brand_id', this.id)
        .where('is_visible', true)
        .orderBy('name', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo productos visibles de la marca:', error)
      throw error
    }
  }

  async getFeaturedProducts() {
    try {
      return await Product.query()
        .where('brand_id', this.id)
        .where('is_featured', true)
        .orderBy('name', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo productos destacados de la marca:', error)
      throw error
    }
  }

  // ✅ MÉTODOS ESTÁTICOS ADICIONALES
  static async getBrandsWithProducts() {
    try {
      return await Brand.query().whereHas('products').orderBy('name', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo marcas con productos:', error)
      throw error
    }
  }

  static async getBrandsWithVisibleProducts() {
    try {
      return await Brand.query()
        .whereHas('products', (query) => {
          query.where('is_visible', true)
        })
        .orderBy('name', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo marcas con productos visibles:', error)
      throw error
    }
  }

  static async getBrandByName(name: string) {
    try {
      return await Brand.query().where('name', 'ilike', `%${name}%`).first()
    } catch (error) {
      console.error('❌ Error obteniendo marca por nombre:', error)
      throw error
    }
  }
}
