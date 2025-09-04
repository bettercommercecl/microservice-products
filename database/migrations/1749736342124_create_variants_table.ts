import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'variants'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      // Identificadores
      table.integer('id').primary()
      table
        .integer('product_id')
        .unsigned()
        .references('id')
        .inTable('products')
        .onDelete('CASCADE')
        .nullable()
      table.string('title', 255).notNullable()
      table.string('sku', 255).notNullable().unique()

      // Estructura de precios (nombres del modelo actual)
      table.integer('normal_price').notNullable()
      table.integer('discount_price').notNullable()
      table.integer('cash_price').notNullable()
      table.string('discount_rate', 255).notNullable()

      // Inventario (nombres del modelo actual)
      table.integer('stock').notNullable().defaultTo(0)
      table.integer('warning_stock').notNullable().defaultTo(0)

      // Imágenes
      table.string('image', 255).notNullable()
      table.json('images').notNullable().defaultTo('[]') // Array de strings

      // Gestión de categorización del producto
      table.json('categories').nullable().defaultTo('[]') // Array de IDs de categorías

      // Cantidades y costos
      table.integer('quantity').notNullable().defaultTo(0)
      table.integer('armed_cost').notNullable().defaultTo(0)
      table.integer('armed_quantity').notNullable().defaultTo(0)

      // Dimensiones y peso
      table.decimal('weight', 10, 2).notNullable()
      table.decimal('height', 10, 2).nullable()
      table.decimal('depth', 10, 2).nullable()
      table.decimal('width', 10, 2).nullable()

      // Información adicional
      table.string('type', 255).nullable()
      table.jsonb('options').nullable().defaultTo('[]')
      table.json('related_products').nullable().defaultTo('[]')
      table.text('option_label').nullable()
      table.text('keywords').nullable()
      table.boolean('is_visible').defaultTo(false)

      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
