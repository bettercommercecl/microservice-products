import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'variants'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('product_id').unsigned().references('id').inTable('products').onDelete('CASCADE').nullable()
      table.string('title', 255).notNullable()
      table.string('sku', 255).notNullable()
      table.float('normal_price').notNullable()
      table.float('discount_price').notNullable()
      table.float('cash_price').notNullable()
      table.string('discount_rate', 255).notNullable()
      table.integer('stock').notNullable()
      table.integer('warning_stock').notNullable()
      table.string('image', 255).notNullable()
      table.specificType('images', 'text[]').notNullable()
      table.integer('quantity').notNullable()
      table.float('armed_cost').notNullable()
      table.integer('armed_quantity').notNullable()
      table.float('weight').notNullable()
      table.float('height').nullable()
      table.float('width').nullable()
      table.float('depth').nullable()
      table.string('type', 255).nullable()
      table.jsonb('options').nullable().defaultTo('[]')
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
} 