import { BaseSchema } from '@adonisjs/lucid/schema'

/**
 * Renombra SKUs temporales con patrones viejos al prefijo normalizado _sync_
 * para que sync_cleanup_service los detecte con un solo strpos(sku, '_sync_').
 */
export default class extends BaseSchema {
  protected tableName = 'variants'

  async up() {
    if (!(await this.schema.hasTable(this.tableName))) return

    await this.db.rawQuery(
      `UPDATE variants
       SET sku = REPLACE(sku, '__missing_sku__', '_sync_missing_')
       WHERE sku LIKE '__missing_sku__%'`
    )
    await this.db.rawQuery(
      `UPDATE variants
       SET sku = REPLACE(sku, '_batch_tmp_', '_sync_stash_')
       WHERE sku LIKE '_batch_tmp_%'`
    )
  }

  async down() {
    if (!(await this.schema.hasTable(this.tableName))) return

    await this.db.rawQuery(
      `UPDATE variants
       SET sku = REPLACE(sku, '_sync_missing_', '__missing_sku__')
       WHERE sku LIKE '_sync_missing_%'`
    )
    await this.db.rawQuery(
      `UPDATE variants
       SET sku = REPLACE(sku, '_sync_stash_', '_batch_tmp_')
       WHERE sku LIKE '_sync_stash_%'`
    )
  }
}
