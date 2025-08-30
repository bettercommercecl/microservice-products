import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'
import Brand from './brand.js'
import CategoryProduct from './category_product.js'
import ChannelProduct from './channel_product.js'

export default class Product extends BaseModel {
  public static table = 'products'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare image: string

  @column()
  declare images: any[] | null

  @column()
  declare hover: string | null

  @column()
  declare title: string

  @column()
  declare page_title: string

  @column()
  declare description: string

  @column()
  declare brand_id: number | null

  @column()
  declare stock: number

  @column()
  declare warning_stock: number

  @column()
  declare discount_price: number | null

  @column()
  declare normal_price: number

  @column()
  declare cash_price: number

  @column()
  declare percent: string | null

  @column()
  declare url: string

  @column()
  declare type: string

  @column()
  declare quantity: number

  @column()
  declare armed_cost: number

  @column()
  declare weight: number

  @column()
  declare sort_order: number

  @column()
  declare reserve: string | null

  @column()
  declare reviews: Record<string, any> | null

  @column()
  declare sameday: boolean

  @column()
  declare free_shipping: boolean

  @column()
  declare despacho24horas: boolean

  @column()
  declare featured: boolean

  @column()
  declare pickup_in_store: boolean

  @column()
  declare is_visible: boolean

  @column()
  declare turbo: boolean

  @column()
  declare meta_description: string

  @column()
  declare meta_keywords: string[]

  @column({ serializeAs: 'sizes' })
  declare sizes: string[] | null

  @belongsTo(() => Brand, {
    foreignKey: 'brand_id',
  })
  declare brand: BelongsTo<typeof Brand>

  @hasMany(() => CategoryProduct, {
    foreignKey: 'product_id',
  })
  declare categories: any

  @hasMany(() => ChannelProduct, {
    foreignKey: 'product_id',
  })
  declare channels: HasMany<typeof ChannelProduct>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
