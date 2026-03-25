import { BaseSchema } from '@adonisjs/lucid/schema'
import db from '@adonisjs/lucid/services/db'

/**
 * Una fila = una linea del pack (orden en el metafield), no (pack_id, variant_id).
 * line_index: 0-based dentro de cada pack_id. UNIQUE(pack_id, line_index).
 * Permite la misma variante hijo en varias lineas (cantidades distintas).
 */
export default class extends BaseSchema {
  async up() {
    await db.rawQuery(`
      ALTER TABLE products_packs
      ADD COLUMN IF NOT EXISTS line_index integer
    `)

    await db.rawQuery(`
      WITH numbered AS (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY pack_id ORDER BY id) - 1 AS idx
        FROM products_packs
      )
      UPDATE products_packs p
      SET line_index = numbered.idx
      FROM numbered
      WHERE p.id = numbered.id
    `)

    await db.rawQuery(`
      ALTER TABLE products_packs
      ALTER COLUMN line_index SET DEFAULT 0
    `)
    await db.rawQuery(`
      ALTER TABLE products_packs
      ALTER COLUMN line_index SET NOT NULL
    `)

    await db.rawQuery(`
      CREATE UNIQUE INDEX IF NOT EXISTS products_packs_pack_id_line_index_unique
      ON products_packs (pack_id, line_index)
    `)
  }

  async down() {
    await db.rawQuery(`DROP INDEX IF EXISTS products_packs_pack_id_line_index_unique`)
    await db.rawQuery(`ALTER TABLE products_packs DROP COLUMN IF EXISTS line_index`)
  }
}
