// app/Models/Variant.ts
import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import Product from './product.js'
import CatalogSafeStock from './catalog.safe.stock.js'

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
  declare discount_price: number

  @column()
  declare cash_price: number

  @column()
  declare discount_rate: string

  @column()
  declare stock: number

  @column()
  declare warning_stock: number

  @column()
  declare image: string

  @column()
  declare images: string | null
  // Gestión de categorización del producto
  @column({
    serializeAs: 'categories',
    serialize: (value: string) => {
      try {
        return value ? JSON.parse(value) : []
      } catch {
        return []
      }
    },
    prepare: (value: number[]) => {
      return JSON.stringify(value)
    },
  })
  declare categories: number[] | string
  @column()
  declare quantity: number

  @column()
  declare armed_cost: number

  @column()
  declare armed_quantity: number

  @column()
  declare weight: number

  @column()
  declare height: number

  @column()
  declare depth: number

  @column()
  declare width: number

  @column()
  declare type: string

  @column({
    serializeAs: 'options',
    serialize: (value: string) => {
      try {
        return value ? JSON.parse(value) : []
      } catch {
        return []
      }
    },
    prepare: (value: any[]) => {
      return value ? JSON.stringify(value) : null
    },
  })
  declare options: any[] | string | null

  @column({
    serializeAs: 'related_products',
    serialize: (value: string) => {
      try {
        return value ? JSON.parse(value) : []
      } catch {
        return []
      }
    },
    prepare: (value: number[]) => {
      return value ? JSON.stringify(value) : null
    },
  })
  declare related_products: number[] | string | null

  @column()
  declare option_label: string | null

  @column()
  declare keywords: string | null
  @column()
  declare is_visible: boolean
  // ✅ RELACIONES
  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @hasOne(() => CatalogSafeStock, {
    foreignKey: 'sku',
    localKey: 'sku',
  })
  declare stockData: HasOne<typeof CatalogSafeStock>

  @column.dateTime({ autoCreate: true, serializeAs: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: 'updated_at' })
  declare updatedAt: DateTime
}

/*
// Para obtener el producto padre
const product = await variant.product

// Para obtener datos de inventario desde CatalogSafeStock
const stockInfo = await variant.stockData

// Para acceder al valor de stock directo
const stockValue = variant.stock
 */
