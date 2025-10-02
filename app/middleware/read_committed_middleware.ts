import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Logger from '@adonisjs/core/services/logger'

export default class ReadCommittedMiddleware {
  private readonly logger = Logger.child({ service: 'ReadCommittedMiddleware' })

  async handle({ request }: HttpContext, next: () => Promise<void>) {
    this.logger.debug(`🔍 Aplicando READ COMMITTED a: ${request.method()} ${request.url()}`)

    const startTime = Date.now()

    try {
      // Envolver en transacción READ COMMITTED
      await db.transaction(
        async (_trx) => {
          await next()
        },
        {
          isolationLevel: 'read committed',
        }
      )

      const duration = Date.now() - startTime
      this.logger.info(`⏱️ Transacción READ COMMITTED completada: ${duration}ms`)

      // 🔍 Log adicional para debugging
      this.logger.debug(`✅ Middleware READ COMMITTED finalizado exitosamente`)
    } catch (error) {
      const duration = Date.now() - startTime
      this.logger.error(`❌ Error en middleware READ COMMITTED (${duration}ms):`, error)
      throw error
    }
  }
}
