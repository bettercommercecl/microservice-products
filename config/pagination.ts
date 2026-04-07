import env from '#start/env'

/** Evita límites absurdos aunque PAGINATION_MAX_LIMIT venga mal configurado */
const ABSOLUTE_CEILING = 50_000

function resolveMaxLimit(): number {
  const fromEnv = env.get('PAGINATION_MAX_LIMIT') as number | undefined
  if (typeof fromEnv === 'number' && Number.isFinite(fromEnv) && fromEnv > 0) {
    return Math.min(Math.floor(fromEnv), ABSOLUTE_CEILING)
  }
  return 10_000
}

/**
 * Paginación de listados (marcas / M2M): default cuando no viene ?limit,
 * y tope máximo para proteger memoria y tiempo de respuesta.
 */
export const paginationConfig = {
  defaultPage: 1,
  defaultLimit: 50,
  maxLimit: resolveMaxLimit(),
} as const
