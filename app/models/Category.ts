import { DateTime } from 'luxon'
import { BaseModel, column, hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import CategoryProduct from './category_product.js'

export default class Category extends BaseModel {
  protected tableName = 'categories'

  @column({ isPrimary: true })
  declare category_id: number

  @column()
  declare title: string

  @column()
  declare url: string

  @column()
  declare parent_id: number

  @column()
  declare order: number

  @column()
  declare image: string | null

  @column()
  declare is_visible: boolean

  @column()
  declare tree_id: number | null

  @hasMany(() => CategoryProduct)
  declare products: HasMany<typeof CategoryProduct>

  @hasMany(() => Category, {
    foreignKey: 'parent_id',
    localKey: 'category_id',
  })
  declare children: HasMany<typeof Category>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime
}
