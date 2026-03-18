import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const VariantController = () => import('#controllers/variants/variant_controller')

// Rutas de variantes
router
  .group(() => {
    router
      .get('/variants', [VariantController, 'index'])
      .use(middleware.readCommitted())
      .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
    router
      .get('/variants/paginated', [VariantController, 'indexPaginated'])
      .use(middleware.readCommitted())
      .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
    router
      .get('/variants/by-channel', [VariantController, 'byChannel'])
      .use(middleware.readCommitted())
      .use(middleware.rateLimit({ max: 360, windowMs: 60_000, key: 'ip' }))
    router
      .post('/variants/formatted-by-ids', [VariantController, 'getFormattedByIds'])
      .use(middleware.readCommitted())
      .use(middleware.rateLimit({ max: 60, windowMs: 60_000, key: 'ip' }))
  })
  .use(middleware.m2mAuth())
  .prefix('api')
