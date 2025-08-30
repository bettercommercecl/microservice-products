import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import ChannelProduct from './channel_product.js'

export default class Channel extends BaseModel {
  public static table = 'channels'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare name: string

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  @hasMany(() => ChannelProduct, {
    foreignKey: 'channel_id',
  })
  declare products: HasMany<typeof ChannelProduct>
}
