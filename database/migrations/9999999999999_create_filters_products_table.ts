import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'filters_products'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('product_id').unsigned().notNullable()
      table.integer('category_id').unsigned().notNullable()
      table.timestamps(true)
      table.foreign('product_id').references('products.id')
      table.foreign('category_id').references('categories.category_id')
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
