import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

const SyncControllerV2 = () => import('#controllers/synchronizations/v2/sync_controller')
const FullSyncController = () => import('#controllers/synchronizations/v2/full_sync_controller')

router
  .group(() => {
    router
      .get('/completo', [FullSyncController, 'syncFull'])
      .use(middleware.rateLimit({ max: 1, windowMs: 600_000, key: 'global' }))
    router
      .get('/marcas', [SyncControllerV2, 'syncBrands'])
      .use(middleware.rateLimit({ max: 1, windowMs: 5_000, key: 'global' }))
    router
      .get('/categorias', [SyncControllerV2, 'syncCategories'])
      .use(middleware.rateLimit({ max: 1, windowMs: 15_000, key: 'global' }))
    router
      .get('/canales', [SyncControllerV2, 'syncChannels'])
      .use(middleware.rateLimit({ max: 10, windowMs: 60_000, key: 'global' }))
    router
      .get('/productos', [SyncControllerV2, 'syncProducts'])
      .use(middleware.rateLimit({ max: 4, windowMs: 60_000, key: 'global' }))
    router
      .get('/packs', [SyncControllerV2, 'syncPacks'])
      .use(middleware.rateLimit({ max: 1, windowMs: 15_000, key: 'global' }))
    router
      .get('/packs-reserva', [SyncControllerV2, 'syncPacksReserve'])
      .use(middleware.rateLimit({ max: 1, windowMs: 20_000, key: 'global' }))
    router
      .get('/stock', [SyncControllerV2, 'syncStock'])
      .use(middleware.rateLimit({ max: 1, windowMs: 10_000, key: 'global' }))
  })
  .prefix('api/sync')
