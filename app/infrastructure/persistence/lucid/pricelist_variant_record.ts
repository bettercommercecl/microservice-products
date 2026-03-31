import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Variant from './variant.js'

export default class PricelistVariantRecord extends BaseModel {
  public static table = 'pricelist_variant_records'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare price_list_id: number

  @column()
  declare product_id: number

  @column()
  declare variant_id: number

  @column()
  declare price: number

  @column()
  declare sale_price: number | null

  @column()
  declare calculated_price: number

  @column()
  declare retail_price: number | null

  @column()
  declare map_price: number | null

  @column()
  declare currency: string

  @column.dateTime()
  declare bc_date_modified: DateTime | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @belongsTo(() => Variant, {
    foreignKey: 'variant_id',
    localKey: 'id',
  })
  declare variant: BelongsTo<typeof Variant>
}
