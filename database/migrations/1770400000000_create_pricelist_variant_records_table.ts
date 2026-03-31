import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Snapshot de registros del price list de BigCommerce (v3/pricelists/{id}/records).
 * variant_id es el ID de variante en BC (coincide con variants.id en este proyecto).
 * Sin FK a variants para no bloquear upserts antes del primer insert de variantes en un lote.
 */
export default class extends BaseSchema {
  protected tableName = 'pricelist_variant_records'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('price_list_id').unsigned().notNullable()
      table.integer('product_id').unsigned().notNullable()
      table.integer('variant_id').unsigned().notNullable()
      table.double('price').notNullable()
      table.double('sale_price').nullable()
      table.double('calculated_price').notNullable()
      table.double('retail_price').nullable()
      table.double('map_price').nullable()
      table.string('currency', 8).notNullable()
      table.timestamp('bc_date_modified', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(this.now())
      table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(this.now())

      table.unique(['price_list_id', 'variant_id'], 'uq_pricelist_variant_records_list_variant')
      table.index(['variant_id'], 'idx_pricelist_variant_records_variant_id')
      table.index(['product_id'], 'idx_pricelist_variant_records_product_id')
      table.index(['price_list_id'], 'idx_pricelist_variant_records_price_list_id')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
