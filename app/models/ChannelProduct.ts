import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import Channel from './Channel.js'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'

export default class ChannelProduct extends BaseModel {
  public static table = 'channel_product'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare channel_id: number

  @column()
  declare product_id: number

  @belongsTo(() => Channel, {
    foreignKey: 'channel_id',
  })
  declare channel: BelongsTo<typeof Channel>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
} 