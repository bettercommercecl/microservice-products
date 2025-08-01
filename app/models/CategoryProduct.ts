import {DateTime} from 'luxon'
import {BaseModel, column, belongsTo} from '@adonisjs/lucid/orm'
import type {BelongsTo} from '@adonisjs/lucid/types/relations'
import Product from './Product.js'
import Category from './Category.js'

export default class CategoryProduct extends BaseModel {
  public static table = 'category_products'

  @column({isPrimary: true})
  declare id: number

  @column()
  declare product_id: number

  @column()
  declare category_id: number

  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => Category, {
    foreignKey: 'category_id',
  })
  declare category: BelongsTo<typeof Category>

  @column.dateTime({autoCreate: true})
  declare createdAt: DateTime

  @column.dateTime({autoCreate: true, autoUpdate: true})
  declare updatedAt: DateTime
}
