import { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'

/**
 * Middleware para capturar errores antes del handler global
 */
export default class ErrorCatcherMiddleware {
  private readonly logger = Logger.child({ service: 'ErrorCatcherMiddleware' })

  async handle(ctx: HttpContext, next: () => Promise<void>) {
    try {
      await next()
    } catch (error) {
      this.logger.error('Error capturado', {
        error: error instanceof Error ? error.message : String(error),
        url: ctx.request.url(),
        method: ctx.request.method(),
      })

      throw error
    }
  }
}
