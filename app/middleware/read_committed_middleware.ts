import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Logger from '@adonisjs/core/services/logger'

export default class ReadCommittedMiddleware {
  private readonly logger = Logger.child({ service: 'ReadCommittedMiddleware' })

  async handle({ request }: HttpContext, next: () => Promise<void>) {
    // Solo aplicar a métodos GET (consultas)
    if (request.method() !== 'GET') {
      return next()
    }

    this.logger.debug(`🔍 Aplicando READ COMMITTED a: ${request.method()} ${request.url()}`)

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
    } catch (error) {
      this.logger.error('❌ Error en middleware READ COMMITTED:', error)
      throw error
    }
  }
}
