import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'channel_product'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id')
      table.integer('channel_id').unsigned().notNullable()
      table.integer('product_id').unsigned().notNullable()
      table.timestamps(true)
      table.unique(['channel_id', 'product_id'])
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
