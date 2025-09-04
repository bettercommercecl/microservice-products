import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // Identificadores y información básica (según modelo actual)
      table.integer('id').primary()
      table.integer('product_id').notNullable().unique()
      table.string('image').notNullable().defaultTo('')
      table.json('images').nullable().defaultTo('[]')
      table.string('hover').nullable().defaultTo('')
      table.string('title').notNullable() // name -> title
      table.string('page_title').notNullable()
      table.text('description').notNullable()
      table.string('type').notNullable()

      // Relaciones
      table.integer('brand_id').unsigned().references('id').inTable('brands').onDelete('SET NULL')
      table.json('categories').notNullable() // Array de IDs de categorías

      // Control de inventario (nombres del modelo actual)
      table.integer('stock').notNullable().defaultTo(0) // inventory_level -> stock
      table.integer('warning_stock').notNullable().defaultTo(0) // inventory_warning_level -> warning_stock

      // Estructura de precios (nombres del modelo actual)
      table.integer('normal_price').notNullable() // price -> normal_price
      table.integer('discount_price').notNullable() // sale_price -> discount_price
      table.integer('cash_price').notNullable()
      table.string('percent').nullable()
      table.string('url').notNullable().unique()

      // Cantidades y costos
      table.integer('quantity').notNullable().defaultTo(0)
      table.integer('armed_cost').nullable()
      table.decimal('weight', 10, 2).notNullable()
      table.integer('sort_order').notNullable().defaultTo(0)

      // Campos especiales del negocio
      table.string('reserve').nullable().defaultTo('')
      table.json('reviews').nullable().defaultTo('[]')
      table.boolean('sameday').defaultTo(false)
      table.boolean('free_shipping').defaultTo(false)
      table.boolean('despacho24horas').defaultTo(false)
      table.boolean('featured').defaultTo(false) // is_featured -> featured
      table.boolean('pickup_in_store').defaultTo(false)
      table.boolean('is_visible').defaultTo(true)
      table.boolean('turbo').defaultTo(false)

      // SEO y metadatos
      table.text('meta_description').nullable().defaultTo('')
      table.json('meta_keywords').nullable().defaultTo('[]')
      table.json('sizes').nullable().defaultTo('[]')

      // Campos adicionales del modelo
      table.json('related_products').nullable().defaultTo('[]')
      table.integer('total_sold').notNullable().defaultTo(0)

      // Timer fields
      table.boolean('timer_status').nullable().defaultTo(false) // boolean -> string
      table.integer('timer_price').nullable().defaultTo(0)
      table.timestamp('timer_datetime').nullable().defaultTo(null)

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
