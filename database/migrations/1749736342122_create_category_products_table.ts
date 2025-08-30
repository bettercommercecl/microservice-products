import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'category_products'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('product_id')
        .unsigned()
        .references('id')
        .inTable('products')
        .onDelete('CASCADE')
      table
        .integer('category_id')
        .unsigned()
        .references('category_id')
        .inTable('categories')
        .onDelete('CASCADE')

      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Índices
      table.unique(['product_id', 'category_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
