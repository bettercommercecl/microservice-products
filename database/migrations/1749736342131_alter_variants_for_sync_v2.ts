import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'variants'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Campo faltante respecto a las marcas
      table.string('reserve').nullable()

      // Precios de integer a float para soportar decimales (CO, PE)
      table.float('normal_price').notNullable().defaultTo(0).alter()
      table.float('discount_price').notNullable().defaultTo(0).alter()
      table.float('cash_price').notNullable().defaultTo(0).alter()
      table.float('armed_cost').notNullable().defaultTo(0).alter()

      // Índices para búsquedas frecuentes en la sync y endpoints
      table.index(['product_id'], 'idx_variants_product_id')
      table.index(['sku'], 'idx_variants_sku')
      table.index(['is_visible'], 'idx_variants_is_visible')
      table.index(['product_id', 'is_visible'], 'idx_variants_product_visible')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('reserve')

      table.integer('normal_price').notNullable().defaultTo(0).alter()
      table.integer('discount_price').notNullable().defaultTo(0).alter()
      table.integer('cash_price').notNullable().defaultTo(0).alter()
      table.integer('armed_cost').notNullable().defaultTo(0).alter()

      table.dropIndex([], 'idx_variants_product_id')
      table.dropIndex([], 'idx_variants_sku')
      table.dropIndex([], 'idx_variants_is_visible')
      table.dropIndex([], 'idx_variants_product_visible')
    })
  }
}
