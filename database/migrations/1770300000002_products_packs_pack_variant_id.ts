import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

/**
 * Variante del producto pack en BC: variants.id donde variants.product_id = pack_id.
 * Permite poner stock 0 en la variante correcta cuando una linea hija queda en 0.
 * variant_id sigue siendo la variante del componente (hijo / inventario).
 */
export default class extends BaseSchema {
  async up() {
    await db.rawQuery(`
      ALTER TABLE products_packs
      ADD COLUMN IF NOT EXISTS pack_variant_id integer NULL
    `)
    await db.rawQuery(`
      CREATE INDEX IF NOT EXISTS idx_products_packs_pack_variant_id
      ON products_packs (pack_variant_id)
    `)
  }

  async down() {
    await db.rawQuery(`DROP INDEX IF EXISTS idx_products_packs_pack_variant_id`)
    await db.rawQuery(`ALTER TABLE products_packs DROP COLUMN IF EXISTS pack_variant_id`)
  }
}
