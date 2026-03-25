import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'channels'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.integer('tree_id').nullable()
      table.integer('parent_category').nullable()
      table.string('country', 10).nullable()
    })
  }

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('tree_id')
      table.dropColumn('parent_category')
      table.dropColumn('country')
    })
  }
}
