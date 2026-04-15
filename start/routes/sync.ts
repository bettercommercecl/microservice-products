import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const SyncController = () => import('#controllers/synchronizations/v1/sync_controller')

router
  .group(() => {
    router
      .get('/sincronizar-productos/:channel_id', [SyncController, 'syncProducts'])
      .use(middleware.rateLimit({ max: 1, windowMs: 240_000, key: 'global' }))
    router
      .get('/sincronizar-categorias', [SyncController, 'syncCategories'])
      .use(middleware.rateLimit({ max: 1, windowMs: 15_000, key: 'global' }))
    router
      .get('/sincronizar-marcas', [SyncController, 'syncBrands'])
      .use(middleware.rateLimit({ max: 1, windowMs: 5_000, key: 'global' }))
    router
      .get('/sincronizar-canales', [SyncController, 'syncChannels'])
      .use(middleware.rateLimit({ max: 10, windowMs: 60_000, key: 'global' }))
  })
  //.use(middleware.m2mAuth())
  .prefix('api')
