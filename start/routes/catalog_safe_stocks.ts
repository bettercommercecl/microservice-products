import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const CatalogSafeStocksController = () =>
  import('#controllers/catalog_safe_stocks/catalog_safe_stocks_controller')

router
  .group(() => {
    router
      .get('/catalog-safe-stocks', [CatalogSafeStocksController, 'indexPaginated'])
      .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
  })
  .use(middleware.m2mAuth())
  .prefix('api')

