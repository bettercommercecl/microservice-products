import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'catalog_safe_stocks'

  public async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('sku').notNullable()
      table.integer('product_id').notNullable()
      table.integer('variant_id').notNullable().unique()
      table.integer('safety_stock').defaultTo(0)
      table.integer('warning_level').nullable().defaultTo(0)
      table.integer('available_to_sell').nullable().defaultTo(0)
      table.string('bin_picking_number').nullable()
      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })
    })
  }

  public async down() {
    this.schema.dropTable(this.tableName)
  }
}
