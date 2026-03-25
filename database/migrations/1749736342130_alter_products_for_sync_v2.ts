import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Campo faltante respecto a las marcas
      table.boolean('nextday').nullable().defaultTo(false)

      // Precios de integer a float para soportar decimales (CO, PE)
      table.float('normal_price').notNullable().defaultTo(0).alter()
      table.float('discount_price').nullable().defaultTo(0).alter()
      table.float('cash_price').notNullable().defaultTo(0).alter()
      table.float('armed_cost').nullable().defaultTo(0).alter()

      // Índices de rendimiento para queries frecuentes
      table.index(['brand_id'], 'idx_products_brand_id')
      table.index(['discount_price'], 'idx_products_discount_price')
      table.index(['is_visible', 'stock'], 'idx_products_visible_stock')
      table.index(['sort_order'], 'idx_products_sort_order')
      table.index(['is_visible', 'brand_id', 'discount_price'], 'idx_products_filters')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('nextday')

      table.integer('normal_price').notNullable().defaultTo(0).alter()
      table.integer('discount_price').nullable().defaultTo(0).alter()
      table.integer('cash_price').notNullable().defaultTo(0).alter()
      table.integer('armed_cost').nullable().defaultTo(0).alter()

      table.dropIndex([], 'idx_products_brand_id')
      table.dropIndex([], 'idx_products_discount_price')
      table.dropIndex([], 'idx_products_visible_stock')
      table.dropIndex([], 'idx_products_sort_order')
      table.dropIndex([], 'idx_products_filters')
    })
  }
}
