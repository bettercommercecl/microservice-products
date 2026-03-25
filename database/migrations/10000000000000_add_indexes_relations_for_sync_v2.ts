import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    // Índices en category_products para joins frecuentes
    this.schema.alterTable('category_products', (table) => {
      table.index(['product_id'], 'idx_catprod_product_id')
      table.index(['category_id'], 'idx_catprod_category_id')
      table.index(['category_id', 'product_id'], 'idx_catprod_category_product')
    })

    // Índices en options para búsquedas por producto
    this.schema.alterTable('options', (table) => {
      table.index(['product_id'], 'idx_options_product_id')
      table.index(['option_id'], 'idx_options_option_id')
    })

    // Índices en channel_product para filtrado por canal
    this.schema.alterTable('channel_product', (table) => {
      table.index(['channel_id'], 'idx_chanprod_channel_id')
      table.index(['product_id'], 'idx_chanprod_product_id')
    })
  }

  async down() {
    this.schema.alterTable('category_products', (table) => {
      table.dropIndex([], 'idx_catprod_product_id')
      table.dropIndex([], 'idx_catprod_category_id')
      table.dropIndex([], 'idx_catprod_category_product')
    })

    this.schema.alterTable('options', (table) => {
      table.dropIndex([], 'idx_options_product_id')
      table.dropIndex([], 'idx_options_option_id')
    })

    this.schema.alterTable('channel_product', (table) => {
      table.dropIndex([], 'idx_chanprod_channel_id')
      table.dropIndex([], 'idx_chanprod_product_id')
    })
  }
}
