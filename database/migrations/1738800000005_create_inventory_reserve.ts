import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'inventory_reserve'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.string('sku').notNullable().unique()
      table.string('fecha_reserva').nullable()
      table.string('bp').nullable()
      table.string('warning').nullable()
      table.integer('stock').nullable()

      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })

      table.index(['stock'], 'idx_inventory_reserve_stock')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
