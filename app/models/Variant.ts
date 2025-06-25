// app/Models/Variant.ts
import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './Product.js'

export default class Variant extends BaseModel {
  public static table = 'variants'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare product_id: number

  @column()
  declare title: string

  @column()
  declare sku: string

  @column()
  declare normal_price: number

  @column()
  declare discount_price: number | null

  @column()
  declare cash_price: number

  @column()
  declare discount_rate: string | null

  @column()
  declare stock: number

  @column()
  declare warning_stock: number

  @column()
  declare image: string | null

  @column()
  declare images: string[] | null

  @column()
  declare hover: string | null

  @column()
  declare quantity: number

  @column()
  declare armed_cost: number

  @column()
  declare armed_quantity: number

  @column()
  declare weight: number

  @column()
  declare height: number | null

  @column()
  declare depth: number | null

  @column()
  declare width: number | null

  @column()
  declare type: string

  @column()
  declare keywords: string | null

  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @column({ serializeAs: 'options' })
  declare options: any[] | null
}
