import type { ApplicationService } from '@adonisjs/core/types'
import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import CacheService from '#services/cache_service'

/**
 * Registra en el contenedor los servicios de infraestructura usados por sync y APIs.
 * Permite inyeccion via @inject() en controllers/servicios para cumplir DIP (SOLID).
 */
export default class SyncServicesProvider {
  constructor(protected app: ApplicationService) {}

  register() {
    this.app.container.singleton(BigCommerceService, () => new BigCommerceService())
    this.app.container.singleton(CacheService, () => new CacheService())
  }
}
