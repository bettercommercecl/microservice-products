import { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import Logger from '@adonisjs/core/services/logger'

export default class ReadCommittedMiddleware {
  private readonly logger = Logger.child({ service: 'ReadCommittedMiddleware' })

  async handle(_ctx: HttpContext, next: () => Promise<void>) {
    try {
      await db.transaction(
        async (_trx) => {
          await next()
        },
        {
          isolationLevel: 'read committed',
        }
      )
    } catch (error) {
      this.logger.error('Error en transacción READ COMMITTED', error)
      throw error
    }
  }
}
