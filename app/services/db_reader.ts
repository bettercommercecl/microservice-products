import Database from '@adonisjs/lucid/services/db'

/**
 * Conexion de lectura (replica).
 *
 * Usar en consultas de solo lectura que sirven a marcas/APIs para evitar
 * contendir con escrituras del sync en el writer. Si DB_READER_* no esta
 * configurado, postgres_replica usa la misma conexion que postgres (desarrollo).
 *
 * - Modelos: Model.query().useConnection(READER_CONNECTION).fetch() / .firstOrFail()
 * - Raw: getReaderDb().from('tabla').select(...)
 *
 * Siguiente paso: Redis para cachear respuestas de lecturas frecuentes.
 */
export const READER_CONNECTION = 'postgres_replica' as const

/**
 * Devuelve la instancia de conexion a la replica para consultas raw (Knex).
 * Para modelos Lucid usar: Model.query().useConnection(READER_CONNECTION)
 */
export function getReaderDb() {
  return Database.connection(READER_CONNECTION)
}
