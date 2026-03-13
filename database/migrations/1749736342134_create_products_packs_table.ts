import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'products_packs'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').primary()
      table.integer('pack_id').notNullable()
      table.integer('product_id').notNullable()
      table.string('sku', 255).notNullable()
      table.integer('stock').notNullable().defaultTo(0)
      table.integer('quantity').nullable()
      table.boolean('is_variant').notNullable().defaultTo(false)
      table.integer('variant_id').nullable()
      table.string('serial', 255).nullable()
      table.string('reserve', 255).nullable()

      table.timestamp('created_at', { useTz: true })
      table.timestamp('updated_at', { useTz: true })

      table.index(['pack_id'], 'idx_products_packs_pack_id')
      table.index(['sku'], 'idx_products_packs_sku')
      table.index(['is_variant'], 'idx_products_packs_is_variant')
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
