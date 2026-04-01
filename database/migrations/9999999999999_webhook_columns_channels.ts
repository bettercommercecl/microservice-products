import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Debe ejecutarse despues de `9999999999999_create_channels_table` (orden lexicografico).
 */
export default class extends BaseSchema {
  protected tableName = 'channels'

  public async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('webhook_url', 2048).nullable()
      table.string('webhook_secret', 512).nullable()
      table.boolean('webhook_enabled').notNullable().defaultTo(true)
    })
  }

  public async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('webhook_url')
      table.dropColumn('webhook_secret')
      table.dropColumn('webhook_enabled')
    })
  }
}
