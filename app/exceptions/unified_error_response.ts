import type { ErrorContext } from './domain_exception.js'
import { extractDbError } from '#utils/db_error_extractor'

export interface UnifiedErrorResponse {
  success: false
  message: string
  error: string
  context?: ErrorContext & { errors?: Array<{ field: string; message: string; code: string }> }
  meta: {
    timestamp: string
    debug?: string
  }
}

/**
 * Construye la respuesta de error unificada para el handler global.
 */
export function buildUnifiedErrorResponse(
  error: unknown,
  options: {
    statusCode?: number
    includeDebug?: boolean
    overrideMessage?: string
  } = {}
): { body: UnifiedErrorResponse; statusCode: number } {
  const e = error as Error & {
    bcContext?: ErrorContext
    dbError?: Record<string, unknown>
    statusCode?: number
  }
  const extractedDb = extractDbError(error)
  const dbError =
    e?.dbError ??
    (extractedDb.code ? extractedDb : undefined) ??
    (e?.bcContext?.dbError as Record<string, unknown>)
  const bcContext = e?.bcContext

  const context: ErrorContext = {
    type: bcContext?.bcResponse ? 'bigcommerce' : dbError ? 'database' : 'business',
    ...(bcContext?.httpStatus ? { httpStatus: bcContext.httpStatus } : {}),
    ...(bcContext?.bcResponse ? { bcResponse: bcContext.bcResponse } : {}),
    ...(dbError && typeof dbError === 'object' && Object.keys(dbError).length > 0
      ? { dbError: dbError as Record<string, unknown> }
      : {}),
    ...(bcContext?.endpoint ? { endpoint: bcContext.endpoint } : {}),
  }

  const hasContext = !!(context.httpStatus || context.bcResponse || context.dbError)
  const message = options.overrideMessage ?? e?.message ?? 'Error interno del servidor'
  const statusCode = e?.statusCode ?? options.statusCode ?? 500

  const body: UnifiedErrorResponse = {
    success: false,
    message,
    error: message,
    ...(hasContext && { context }),
    meta: {
      timestamp: new Date().toISOString(),
      ...(options.includeDebug && e?.stack && { debug: e.stack }),
    },
  }

  return { body, statusCode }
}
