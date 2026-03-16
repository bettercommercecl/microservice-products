import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'
import { DomainException, type ErrorContext } from '#domain/exceptions/domain_exception'
import { buildUnifiedErrorResponse } from './unified_error_response.js'
import { extractDbError } from '#utils/db_error_extractor'

export default class HttpExceptionHandler extends ExceptionHandler {
  protected debug = !app.inProduction

  async handle(error: unknown, ctx: HttpContext) {
    const logger = Logger.child({ service: 'GlobalExceptionHandler' })

    try {
      if (this.isNotFoundError(error) && ctx.request.url().includes('favicon.ico')) {
        return ctx.response.status(204).send('')
      }
      const { body, statusCode } = this.buildResponse(error, ctx)
      this.logError(error, ctx, logger)
      return ctx.response.status(statusCode).json(body)
    } catch (handlerError) {
      logger.error('Error en el manejador de excepciones:', handlerError)
      const { body, statusCode } = buildUnifiedErrorResponse(
        new Error('Error interno del manejador'),
        { statusCode: 500 }
      )
      return ctx.response.status(statusCode).json(body)
    }
  }

  /**
   * Construye la respuesta unificada segun el tipo de error.
   * Siempre devuelve la misma estructura { success, message, error, context?, meta }.
   */
  private buildResponse(
    error: unknown,
    _ctx: HttpContext
  ): { body: ReturnType<typeof buildUnifiedErrorResponse>['body']; statusCode: number } {
    if (this.isValidationError(error)) {
      return {
        body: {
          success: false,
          message: 'Error de validacion en los datos de entrada',
          error: (error as Error).message,
          context: { type: 'validation', errors: this.extractValidationErrors(error) },
          meta: { timestamp: new Date().toISOString() },
        },
        statusCode: 400,
      }
    }

    if (this.isAuthError(error)) {
      return {
        body: buildUnifiedErrorResponse(error, {
          statusCode: 403,
          overrideMessage: 'Acceso denegado',
        }).body,
        statusCode: 403,
      }
    }

    if (this.isNotFoundError(error)) {
      return {
        body: buildUnifiedErrorResponse(error, {
          statusCode: 404,
          overrideMessage: 'Recurso no encontrado',
        }).body,
        statusCode: 404,
      }
    }

    if (this.isAxiosError(error)) {
      const { body, statusCode } = buildUnifiedErrorResponse(error, { statusCode: 502 })
      body.context = { ...body.context, type: 'external' as const }
      return { body, statusCode }
    }

    if (this.isDatabaseError(error)) {
      const dbError = extractDbError(error)
      const e = error as Error & { dbError?: Record<string, unknown> }
      if (!e.dbError) (e as any).dbError = dbError
      const { body, statusCode } = buildUnifiedErrorResponse(error, {
        statusCode: 500,
        overrideMessage: 'Error en la base de datos',
      })
      body.context = { ...body.context, type: 'database' as const }
      return { body, statusCode }
    }

    if (error instanceof DomainException) {
      const e = error as Error & { bcContext?: ErrorContext; dbError?: Record<string, unknown> }
      e.bcContext = error.context
      e.dbError = error.context?.dbError as Record<string, unknown>
      const { body, statusCode } = buildUnifiedErrorResponse(error, {
        statusCode: error.statusCode,
      })
      if (error.context) body.context = { ...body.context, ...error.context }
      return { body, statusCode }
    }

    if (this.isTypeError(error)) {
      const { body, statusCode } = buildUnifiedErrorResponse(error, {
        statusCode: 500,
        overrideMessage: 'Error interno del sistema',
      })
      if (body.context) body.context.type = 'business'
      return { body, statusCode }
    }

    const { body, statusCode } = buildUnifiedErrorResponse(error, {
      statusCode: 500,
      includeDebug: this.debug,
    })
    return { body, statusCode }
  }

  /**
   * Detecta si es un error de validación de VineJS
   */
  private isValidationError(error: unknown): error is Error & { name: string; messages: any } {
    return error instanceof Error && error.name === 'E_VALIDATION_ERROR'
  }

  /**
   * 🔐 Detecta si es un error de autenticación/autorización
   */
  private isAuthError(error: unknown): error is Error {
    return (
      error instanceof Error &&
      (error.message.includes('Unauthorized') ||
        error.message.includes('Forbidden') ||
        error.message.includes('Access denied') ||
        error.message.includes('Invalid token'))
    )
  }

  /**
   * Detecta si es un error de recurso no encontrado
   */
  private isNotFoundError(error: unknown): error is Error {
    return (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('does not exist') ||
        error.message.includes('No rows returned') ||
        error.message.includes('Cannot GET:') ||
        (error as any).code === 'E_ROUTE_NOT_FOUND')
    )
  }

  /**
   * 🌐 Detecta si es un error de Axios/HTTP
   */
  private isAxiosError(
    error: unknown
  ): error is Error & { isAxiosError?: boolean; response?: any } {
    return (
      error instanceof Error &&
      (error.message.includes('Request failed') ||
        error.message.includes('Network Error') ||
        error.message.includes('timeout') ||
        (error as any).isAxiosError === true)
    )
  }

  /**
   *  Detecta si es un error de base de datos
   */
  private isDatabaseError(error: unknown): error is Error {
    return (
      error instanceof Error &&
      (error.message.includes('duplicate key') ||
        error.message.includes('foreign key') ||
        error.message.includes('constraint') ||
        error.message.includes('connection') ||
        error.message.includes('timeout') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('ENOTFOUND'))
    )
  }

  /**
   * 📝 Detecta si es un error de TypeScript/compilación
   */
  private isTypeError(error: unknown): error is TypeError {
    return error instanceof TypeError
  }

  /**
   * 📋 Extrae errores de validación de VineJS
   */
  private extractValidationErrors(
    error: Error & { messages: any }
  ): Array<{ field: string; message: string; code: string }> {
    try {
      if (error.messages && typeof error.messages === 'object') {
        return Object.entries(error.messages).map(([field, messages]: [string, any]) => ({
          field,
          message: Array.isArray(messages) ? messages[0] : String(messages),
          code: 'VALIDATION_ERROR',
        }))
      }
    } catch (e) {
      // Si falla la extracción, devolver error genérico
    }

    return [{ field: 'general', message: error.message, code: 'VALIDATION_ERROR' }]
  }

  /**
   * 📝 Log del error para debugging
   */
  private logError(error: unknown, ctx: HttpContext, logger: any) {
    const requestInfo = {
      method: ctx.request.method(),
      url: ctx.request.url(),
      ip: ctx.request.ip(),
      userAgent: ctx.request.header('user-agent'),
      timestamp: new Date().toISOString(),
    }

    logger.error('Error capturado globalmente:', {
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      type: typeof error,
      constructor: error?.constructor?.name,
      request: requestInfo,
    })
  }

  /**
   * The method is used to report error to the logging service or
   * the third party error monitoring service.
   *
   * @note You should not attempt to send a response from this method.
   */
  async report(error: unknown, ctx: HttpContext) {
    const logger = Logger.child({ service: 'GlobalExceptionHandler' })
    const e = error as Error & { bcContext?: unknown; dbError?: unknown }

    if (app.inProduction) {
      try {
        logger.error('Error reportado:', {
          message: e?.message,
          bcContext: e?.bcContext,
          dbError: e?.dbError,
        })
      } catch (reportError) {
        logger.error('Error al reportar:', reportError)
      }
    }

    return super.report(error, ctx)
  }
}
