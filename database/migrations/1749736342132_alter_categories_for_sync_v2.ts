import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'categories'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      // Campos faltantes que las marcas tienen y el microservicio no
      table.text('description').nullable()
      table.string('page_title').nullable()
      table.text('search_keywords').nullable()
      table.text('meta_keywords').nullable()
      table.text('meta_description').nullable()
      table.integer('sort_order').notNullable().defaultTo(0)

      // Índices para búsquedas jerárquicas y filtrado
      // Usamos sort_order en lugar de order (palabra reservada en PostgreSQL)
      table.index(['parent_id'], 'idx_categories_parent_id')
      table.index(['is_visible'], 'idx_categories_is_visible')
      table.index(['parent_id', 'is_visible'], 'idx_categories_parent_visible')
      table.index(['parent_id', 'is_visible', 'sort_order'], 'idx_categories_parent_visible_order')
      table.index(['sort_order'], 'idx_categories_sort_order')
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('description')
      table.dropColumn('page_title')
      table.dropColumn('search_keywords')
      table.dropColumn('meta_keywords')
      table.dropColumn('meta_description')
      table.dropColumn('sort_order')

      table.dropIndex([], 'idx_categories_parent_id')
      table.dropIndex([], 'idx_categories_is_visible')
      table.dropIndex([], 'idx_categories_parent_visible')
      table.dropIndex([], 'idx_categories_parent_visible_order')
      table.dropIndex([], 'idx_categories_sort_order')
    })
  }
}
