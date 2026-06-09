import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const MetaCatalogController = () => import('#controllers/meta_catalog/meta_catalog_controller')

router
  .group(() => {
    router
      .get('/meta/:brand/productos.json', [MetaCatalogController, 'productosJson'])
      .use(middleware.rateLimit({ max: 60, windowMs: 60_000, key: 'ip' }))
    router
      .get('/meta/:brand/productos.csv', [MetaCatalogController, 'productosCsv'])
      .use(middleware.rateLimit({ max: 60, windowMs: 60_000, key: 'ip' }))
  })
  .prefix('api')
