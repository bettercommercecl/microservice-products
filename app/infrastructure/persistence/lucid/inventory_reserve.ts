import { DateTime } from 'luxon'
import { BaseModel, column } from '@adonisjs/lucid/orm'

export default class InventoryReserve extends BaseModel {
  public static table = 'inventory_reserve'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare sku: string

  @column()
  declare fecha_reserva: string | null

  @column()
  declare bp: string | null

  @column()
  declare warning: string | null

  @column()
  declare stock: number | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
