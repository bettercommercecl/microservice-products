import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './product.js'
import Variant from './variant.js'

export default class ProductPack extends BaseModel {
  public static table = 'products_packs'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare pack_id: number

  @column()
  declare product_id: number

  @column()
  declare sku: string

  @column()
  declare stock: number

  @column()
  declare quantity: number | null

  @column()
  declare is_variant: boolean

  @column()
  declare variant_id: number | null

  @column()
  declare serial: string | null

  @column()
  declare reserve: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => Variant, {
    foreignKey: 'variant_id',
  })
  declare variant: BelongsTo<typeof Variant>
}
