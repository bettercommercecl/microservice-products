import app from '@adonisjs/core/services/app'
import { HttpContext, ExceptionHandler } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

export default class HttpExceptionHandler extends ExceptionHandler {
  /**
   * In debug mode, the exception handler will display verbose errors
   * with pretty printed stack traces.
   */
  protected debug = !app.inProduction

  /**
   * The method is used for handling errors and returning
   * response to the client
   */
  async handle(error: unknown, ctx: HttpContext) {
    const logger = Logger.child({ service: 'GlobalExceptionHandler' })

    try {
      // 🔍 Identificar el tipo de error y manejarlo apropiadamente
      const errorResponse = this.handleError(error, ctx, logger)

      // 📝 Log del error para debugging
      this.logError(error, ctx, logger)

      return errorResponse
    } catch (handlerError) {
      // 🚨 Si el manejador falla, usar fallback básico
      logger.error('❌ Error en el manejador de excepciones:', handlerError)
      return ctx.response.internalServerError({
        success: false,
        message: 'Error interno del servidor',
        data: null,
        meta: { timestamp: new Date().toISOString() },
      })
    }
  }

  /**
   * 🎯 Maneja diferentes tipos de errores y retorna respuestas apropiadas
   */
  private handleError(error: unknown, ctx: HttpContext, logger: any) {
    const response = ctx.response

    // 🚫 Error de validación (VineJS)
    if (this.isValidationError(error)) {
      logger.warn('⚠️ Error de validación detectado:', error.message)
      return response.badRequest({
        success: false,
        message: 'Error de validación en los datos de entrada',
        data: null,
        errors: this.extractValidationErrors(error),
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    }

    // 🔐 Error de autenticación/autorización
    if (this.isAuthError(error)) {
      logger.warn('🚫 Error de autenticación/autorización:', error.message)
      return response.forbidden({
        success: false,
        message: 'Acceso denegado',
        data: null,
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    }

    // 🔍 Error de recurso no encontrado
    if (this.isNotFoundError(error)) {
      // 🎯 Manejo especial para favicon.ico
      if (ctx.request.url().includes('favicon.ico')) {
        logger.debug('🔍 Favicon request ignorado:', ctx.request.url())
        return response.status(204).send('') // No Content
      }

      logger.warn('🔍 Recurso no encontrado:', error.message)
      return response.notFound({
        success: false,
        message: 'Recurso no encontrado',
        data: null,
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    }

    // 🌐 Error de Axios/HTTP
    if (this.isAxiosError(error)) {
      logger.error('🌐 Error de API externa:', error.message)
      return response.status(502).json({
        success: false,
        message: 'Error en servicio externo',
        data: null,
        errors: [{ field: 'external_api', message: error.message, code: 'EXTERNAL_API_ERROR' }],
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    }

    // 🗄️ Error de base de datos
    if (this.isDatabaseError(error)) {
      logger.error('🗄️ Error de base de datos:', error.message)
      return response.status(500).json({
        success: false,
        message: 'Error en la base de datos',
        data: null,
        errors: [
          { field: 'database', message: 'Error interno de base de datos', code: 'DATABASE_ERROR' },
        ],
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    }

    // 📝 Error de TypeScript/compilación
    if (this.isTypeError(error)) {
      logger.error('📝 Error de tipo:', error.message)
      return response.status(500).json({
        success: false,
        message: 'Error interno del sistema',
        data: null,
        errors: [{ field: 'system', message: 'Error de tipo interno', code: 'TYPE_ERROR' }],
        meta: {
          timestamp: new Date().toISOString(),
        },
      })
    }

    // ⚡ Error interno del servidor (fallback)
    logger.error('⚡ Error interno no manejado:', {
      error: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Unknown',
      stack: error instanceof Error ? error.stack : undefined,
      type: typeof error,
      constructor: error?.constructor?.name,
    })
    return response.internalServerError({
      success: false,
      message: this.debug
        ? error instanceof Error
          ? error.message
          : 'Error interno del servidor'
        : 'Error interno del servidor',
      data: null,
      meta: {
        timestamp: new Date().toISOString(),
        debug: this.debug && error instanceof Error ? error.stack : undefined,
      },
    })
  }

  /**
   * 🔍 Detecta si es un error de validación de VineJS
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
   * 🔍 Detecta si es un error de recurso no encontrado
   */
  private isNotFoundError(error: unknown): error is Error {
    return (
      error instanceof Error &&
      (error.message.includes('not found') ||
        error.message.includes('does not exist') ||
        error.message.includes('No rows returned'))
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
   * 🗄️ Detecta si es un error de base de datos
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

    logger.error('❌ Error capturado globalmente:', {
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

    // 📊 Reportar error a servicios externos (Sentry, LogRocket, etc.)
    if (app.inProduction) {
      try {
        // Aquí puedes integrar con servicios de monitoreo
        // await Sentry.captureException(error)
        // await LogRocket.captureException(error)

        logger.error('📊 Error reportado a servicios externos:', error)
      } catch (reportError) {
        logger.error('❌ Error al reportar a servicios externos:', reportError)
      }
    }

    return super.report(error, ctx)
  }
}
