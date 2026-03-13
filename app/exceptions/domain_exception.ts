/**
 * Excepcion de dominio para errores de negocio, BigCommerce y base de datos.
 * Permite adjuntar contexto que el handler global devolvera en la respuesta.
 */
export type ErrorContextType = 'bigcommerce' | 'database' | 'business' | 'validation' | 'external'

export interface ErrorContext {
  type?: ErrorContextType
  httpStatus?: number
  bcResponse?: unknown
  dbError?: Record<string, unknown>
  code?: string
  endpoint?: string
  [key: string]: unknown
}

export class DomainException extends Error {
  constructor(
    message: string,
    public readonly context?: ErrorContext,
    public readonly statusCode: number = 500
  ) {
    super(message)
    this.name = 'DomainException'
    Object.setPrototypeOf(this, DomainException.prototype)
  }
}

/**
 * Indica si un error tiene contexto adjunto (bcContext, dbError, etc.)
 */
export function hasErrorContext(error: unknown): error is Error & { bcContext?: ErrorContext; dbError?: Record<string, unknown> } {
  const e = error as Record<string, unknown>
  return error instanceof Error && (!!e.bcContext || !!e.dbError)
}
