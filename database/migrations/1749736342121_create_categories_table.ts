import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.integer('category_id').primary().notNullable()
      table.string('title').notNullable()
      table.string('url').notNullable()
      table.integer('parent_id').notNullable()
      table.integer('order').notNullable()
      table.string('image').nullable()
      table.boolean('is_visible').defaultTo(false)
      table.integer('tree_id').nullable()
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
