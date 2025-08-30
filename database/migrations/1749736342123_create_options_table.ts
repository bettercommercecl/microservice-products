import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'options'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table
        .integer('product_id')
        .unsigned()
        .references('id')
        .inTable('products')
        .onDelete('CASCADE')
      table.integer('option_id').notNullable()
      table.string('label').notNullable()
      table.json('options').nullable()

      table.timestamp('created_at')
      table.timestamp('updated_at')

      // Índices
      table.index(['product_id', 'option_id'])
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
