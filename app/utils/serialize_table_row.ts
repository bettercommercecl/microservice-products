/**
 * Convierte columnas de timestamp de una fila (tabla) a string ISO
 * y opcionalmente parsea columnas JSON (string -> object/array) para respuesta API.
 */
const DEFAULT_DATE_KEYS = ['created_at', 'updated_at']

function safeJsonParse(value: unknown): unknown {
  if (value == null) return value
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function serializeTableRow<T extends Record<string, unknown>>(
  row: T,
  dateKeys: string[] = DEFAULT_DATE_KEYS,
  jsonKeys: string[] = []
): T {
  const out = { ...row } as T
  for (const k of jsonKeys) {
    if (!(k in out)) continue
    ;(out as Record<string, unknown>)[k] = safeJsonParse(out[k])
  }
  for (const k of dateKeys) {
    if (!(k in out)) continue
    const v = out[k]
    if (v == null) continue
    if (v instanceof Date) {
      ;(out as Record<string, unknown>)[k] = v.toISOString()
    } else if (typeof v === 'object' && v !== null && 'toISOString' in v) {
      ;(out as Record<string, unknown>)[k] = (v as { toISOString: () => string }).toISOString()
    } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) {
      ;(out as Record<string, unknown>)[k] = v
    }
  }
  return out
}

export function serializeTableRows<T extends Record<string, unknown>>(
  rows: T[],
  dateKeys: string[] = DEFAULT_DATE_KEYS,
  jsonKeys: string[] = []
): T[] {
  return rows.map((row) => serializeTableRow(row, dateKeys, jsonKeys))
}

/** Nombres de columnas de timestamp que se pueden omitir de la respuesta. */
export const TIMESTAMP_KEYS = ['created_at', 'updated_at']

/** Devuelve una copia de la fila sin las columnas de timestamp (no se incluyen en la respuesta). */
export function omitTimestampKeys<T extends Record<string, unknown>>(row: T): T {
  const out = { ...row }
  for (const k of TIMESTAMP_KEYS) {
    delete out[k]
  }
  return out as T
}

/** Aplica omitTimestampKeys a cada fila. */
export function omitTimestampKeysFromRows<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((row) => omitTimestampKeys(row))
}

/** Columnas JSON de la tabla products (se parsean de string a array/object en la respuesta). */
export const PRODUCT_JSON_KEYS = [
  'images',
  'categories',
  'reviews',
  'meta_keywords',
  'sizes',
  'related_products',
]
