/**
 * Query string: `limit` tiene prioridad; si no viene, se acepta `per_page` (convención común).
 */
export function normalizePaginationQs(qs: Record<string, unknown>): Record<string, unknown> {
  const first = (v: unknown) => (Array.isArray(v) ? v[0] : v)
  const rawLimit = qs.limit ?? qs.per_page
  if (rawLimit === undefined || rawLimit === '') {
    return qs
  }
  return { ...qs, limit: first(rawLimit) }
}
