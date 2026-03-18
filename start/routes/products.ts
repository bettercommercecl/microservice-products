import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

// 🚀 Controlador lazy importado
const ProductsController = () => import('#controllers/products/products_controller')

// Rutas de productos
router
  .group(() => {
    router.get('/products', [ProductsController, 'index']).use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
    router
      .get('/products/reviews/paginated', [ProductsController, 'reviewsPaginated'])
      .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
    router
      .get('/products/paginated', [ProductsController, 'indexPaginated'])
      .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
    router
      .get('/products/by-channel', [ProductsController, 'byChannel'])
      .use(middleware.rateLimit({ max: 240, windowMs: 60_000, key: 'ip' }))
    router.get('/products/:id', [ProductsController, 'show']).use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
    router
      .get('/sync-stats/:channel_id', [ProductsController, 'getSyncStats'])
      .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
  })
  .use(middleware.m2mAuth())
  .prefix('api')
