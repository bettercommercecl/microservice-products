import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

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

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
