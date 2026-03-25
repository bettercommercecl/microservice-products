/**
 * Extrae detalles del error de PostgreSQL para logging y debugging.
 * Los errores de pg/node-postgres exponen code, detail, constraint, table, column.
 */
export function extractDbError(error: unknown): Record<string, unknown> {
  const e = error as Record<string, unknown>
  const cause = e?.cause as Record<string, unknown> | undefined
  const original = e?.originalError as Record<string, unknown> | undefined
  const source = cause ?? original ?? e

  return {
    message: e?.message ?? source?.message,
    code: source?.code ?? e?.code,
    detail: source?.detail ?? e?.detail,
    constraint: source?.constraint ?? e?.constraint,
    table: source?.table ?? e?.table,
    column: source?.column ?? e?.column,
    schema: source?.schema ?? e?.schema,
    hint: source?.hint ?? e?.hint,
    position: source?.position ?? e?.position,
    stack: e?.stack,
    raw: source ? { ...source } : undefined,
  }
}
