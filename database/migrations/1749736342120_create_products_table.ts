import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.string('image').notNullable()
      table.json('images').nullable()
      table.string('hover').nullable()
      table.string('title').notNullable()
      table.string('page_title').notNullable()
      table.text('description').notNullable()
      table.integer('brand_id').unsigned().references('id').inTable('brands').onDelete('SET NULL')
      table.integer('stock').notNullable().defaultTo(0)
      table.integer('warning_stock').notNullable().defaultTo(0)
      table.decimal('discount_price', 10, 2).nullable()
      table.decimal('normal_price', 10, 2).notNullable()
      table.decimal('cash_price', 10, 2).notNullable()
      table.string('percent').nullable()
      table.string('url').notNullable().unique()
      table.string('type').notNullable()
      table.integer('quantity').notNullable().defaultTo(0)
      table.decimal('armed_cost', 10, 2).notNullable()
      table.decimal('weight', 10, 2).notNullable()
      table.integer('sort_order').notNullable().defaultTo(0)
      table.string('reserve').nullable()
      table.json('reviews').nullable()
      table.boolean('sameday').defaultTo(false)
      table.boolean('free_shipping').defaultTo(false)
      table.boolean('despacho24horas').defaultTo(false)
      table.boolean('featured').defaultTo(false)
      table.boolean('pickup_in_store').defaultTo(false)
      table.boolean('is_visible').defaultTo(true)
      table.boolean('turbo').defaultTo(false)
      table.text('meta_description').notNullable()
      table.json('meta_keywords').notNullable()
      table.json('sizes').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
