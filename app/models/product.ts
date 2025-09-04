// Dependencias externas para manejo de fechas
import { DateTime } from 'luxon'

// Core de AdonisJS para ORM y decoradores
import { BaseModel, column, hasMany, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany } from '@adonisjs/lucid/types/relations'

// Modelos relacionados para establecer relaciones
import Brand from './brand.js'
import CategoryProduct from './category_product.js'
import ChannelProduct from './channel_product.js'
import FiltersProduct from './filters_product.js'
import Option from './option.js'
import Variant from './variant.js'
import CatalogSafeStock from './catalog.safe.stock.js'

// Servicio especializado para procesamiento de productos

export default class Product extends BaseModel {
  // Nombre de la tabla en la base de datos
  public static table = 'products'

  // Identificadores y información básica del producto
  @column({ isPrimary: true, serializeAs: 'id' })
  declare id: number

  @column({ serializeAs: 'product_id' })
  declare product_id: number

  // Gestión de imágenes y recursos visuales
  @column({ serializeAs: 'image' })
  declare image: string

  @column({ serializeAs: 'images' })
  declare images: string | null

  @column({ serializeAs: 'hover' })
  declare hover: string | null

  @column({ serializeAs: 'title' })
  declare title: string

  @column({ serializeAs: 'page_title' })
  declare page_title: string

  @column({ serializeAs: 'description' })
  declare description: string

  @column({ serializeAs: 'type' })
  declare type: string

  // Relaciones con otras entidades del sistema
  @column({ serializeAs: 'brand_id' })
  declare brand_id: number | null
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

  // Control de inventario y stock del producto
  @column({ serializeAs: 'stock' })
  declare stock: number

  @column({ serializeAs: 'warning_stock' })
  declare warning_stock: number

  // Estructura de precios del producto según Bigcommerce
  @column({ serializeAs: 'normal_price' })
  declare normal_price: number

  @column({ serializeAs: 'discount_price' })
  declare discount_price: number | null

  @column({ serializeAs: 'cash_price' })
  declare cash_price: number

  @column({ serializeAs: 'percent' })
  declare percent: string | null

  @column({ serializeAs: 'url' })
  declare url: string

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

  @column({
    serializeAs: 'reviews',
    serialize: (value: string) => {
      try {
        return value ? JSON.parse(value) : []
      } catch {
        return []
      }
    },
    prepare: (value: any) => {
      return JSON.stringify(value)
    },
  })
  declare reviews: any | null | string

  @column()
  declare sameday: boolean

  @column()
  declare free_shipping: boolean

  @column({ columnName: 'despacho24horas' })
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
  declare meta_keywords: string | null

  @column({ serializeAs: 'sizes' })
  declare sizes: string | null

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

  @column({ serializeAs: 'total_sold' })
  declare total_sold: number

  // Configuración de ofertas temporales y promociones
  @column({ serializeAs: 'timer_status' })
  declare timer_status: boolean

  @column({ serializeAs: 'timer_price' })
  declare timer_price: number | null

  @column({ serializeAs: 'timer_datetime' })
  declare timer_datetime: DateTime | null

  // Definición de relaciones con otros modelos
  @belongsTo(() => Brand, {
    foreignKey: 'brand_id',
  })
  declare brand: BelongsTo<typeof Brand>

  @hasMany(() => CategoryProduct, {
    foreignKey: 'product_id',
  })
  declare categoryProducts: HasMany<typeof CategoryProduct>

  @hasMany(() => ChannelProduct, {
    foreignKey: 'product_id',
  })
  declare channels: HasMany<typeof ChannelProduct>

  @hasMany(() => FiltersProduct, {
    foreignKey: 'product_id',
  })
  declare filters: HasMany<typeof FiltersProduct>

  @hasMany(() => Option, {
    foreignKey: 'product_id',
  })
  declare options: HasMany<typeof Option>

  @hasMany(() => Variant, {
    foreignKey: 'product_id',
  })
  declare variants: HasMany<typeof Variant>

  @hasMany(() => CatalogSafeStock, {
    foreignKey: 'product_id',
  })
  declare stockData: HasMany<typeof CatalogSafeStock>
}
