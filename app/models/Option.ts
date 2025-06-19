import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './Product.js'

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
}
