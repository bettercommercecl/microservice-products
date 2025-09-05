import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './product.js'

export default class Option extends BaseModel {
  public static table = 'options'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare product_id: number

  @column()
  declare option_id: number

  @column()
  declare label: string

  @column({ serializeAs: 'options' })
  declare options: any

  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // ✅ MÉTODOS PARA OPERACIONES MASIVAS
  static async syncOptionsForProduct(productId: number, optionsData: any[]) {
    try {
      // ✅ 1. Eliminar opciones existentes del producto
      await Option.query().where('product_id', productId).delete()

      // ✅ 2. Crear nuevas opciones
      if (optionsData.length > 0) {
        const optionsToCreate = optionsData.map((option) => ({
          product_id: productId,
          option_id: option.option_id,
          label: option.label,
          options: option.options || null,
        }))

        await Option.createMany(optionsToCreate)
      }

      return true
    } catch (error) {
      console.error('❌ Error sincronizando opciones:', error)
      throw error
    }
  }

  static async updateOrCreateOption(productId: number, optionId: number, data: any) {
    try {
      return await Option.updateOrCreate(
        { product_id: productId, option_id: optionId },
        {
          product_id: productId,
          option_id: optionId,
          label: data.label,
          options: data.options || null,
        }
      )
    } catch (error) {
      console.error('❌ Error actualizando/creando opción:', error)
      throw error
    }
  }

  static async bulkCreateOptions(optionsData: any[]) {
    try {
      return await Option.createMany(optionsData)
    } catch (error) {
      console.error('❌ Error creando opciones masivamente:', error)
      throw error
    }
  }

  static async getOptionsByProductId(productId: number) {
    try {
      return await Option.query().where('product_id', productId).orderBy('option_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo opciones del producto:', error)
      throw error
    }
  }

  // ✅ HELPERS ADICIONALES
  static async getOptionsByOptionId(optionId: number) {
    try {
      return await Option.query()
        .where('option_id', optionId)
        .preload('product')
        .orderBy('product_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo opciones por option_id:', error)
      throw error
    }
  }

  static async deleteOptionsByProductId(productId: number) {
    try {
      return await Option.query().where('product_id', productId).delete()
    } catch (error) {
      console.error('❌ Error eliminando opciones del producto:', error)
      throw error
    }
  }

  static async getOptionLabelsByProductId(productId: number) {
    try {
      const options = await Option.query()
        .where('product_id', productId)
        .select('label', 'option_id')
        .orderBy('option_id', 'asc')

      return options.map((option) => ({
        option_id: option.option_id,
        label: option.label,
      }))
    } catch (error) {
      console.error('❌ Error obteniendo labels de opciones:', error)
      throw error
    }
  }

  // ✅ MÉTODOS DE INSTANCIA
  async getProduct() {
    try {
      return await Product.query().where('id', this.product_id).first()
    } catch (error) {
      console.error('❌ Error obteniendo producto de la opción:', error)
      throw error
    }
  }

  async updateOptionData(data: any) {
    try {
      this.label = data.label || this.label
      this.options = data.options || this.options
      await this.save()
      return this
    } catch (error) {
      console.error('❌ Error actualizando datos de opción:', error)
      throw error
    }
  }
}
