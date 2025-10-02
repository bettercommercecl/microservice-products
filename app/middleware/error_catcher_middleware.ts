import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

/**
 * 🚨 Middleware para capturar errores específicos antes del handler global
 * Captura errores de Axios, base de datos y otros servicios
 */
export default class ErrorCatcherMiddleware {
  private readonly logger = Logger.child({ service: 'ErrorCatcherMiddleware' })

  /**
   * Handle request
   */
  async handle(ctx: HttpContext, next: () => Promise<void>) {
    try {
      // ➡️ Continuar con el siguiente middleware/controlador
      await next()
    } catch (error) {
      // 🚨 Capturar errores específicos antes del handler global
      this.logger.error('❌ Error capturado en middleware:', {
        error: error instanceof Error ? error.message : String(error),
        url: ctx.request.url(),
        method: ctx.request.method(),
        ip: ctx.request.ip(),
        userAgent: ctx.request.header('user-agent'),
      })

      // 🔄 Re-lanzar el error para que lo maneje el handler global
      throw error
    }
  }
}
