import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * URL opcional para disparar refresco del indice de busqueda (GET) tras sync.
 * Mismo ritmo escalonado que webhooks: SYNC_WEBHOOK_GLOBAL_STAGGER_MS.
 */
export default class extends BaseSchema {
  protected tableName = 'channels'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('search_index_refresh_url', 2048).nullable()
      table.boolean('search_index_refresh_enabled').notNullable().defaultTo(true)
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('search_index_refresh_url')
      table.dropColumn('search_index_refresh_enabled')
    })
  }
}
