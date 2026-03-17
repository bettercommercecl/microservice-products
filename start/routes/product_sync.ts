import router from '@adonisjs/core/services/router'

const SyncControllerV2 = () => import('#controllers/synchronizations/v2/sync_controller')
const FullSyncController = () => import('#controllers/synchronizations/v2/full_sync_controller')

router
  .group(() => {
    router.get('/completo', [FullSyncController, 'syncFull'])
    router.get('/marcas', [SyncControllerV2, 'syncBrands'])
    router.get('/categorias', [SyncControllerV2, 'syncCategories'])
    router.get('/canales', [SyncControllerV2, 'syncChannels'])
    router.get('/productos', [SyncControllerV2, 'syncProducts'])
    router.get('/packs', [SyncControllerV2, 'syncPacks'])
    router.get('/packs-reserva', [SyncControllerV2, 'syncPacksReserve'])
    router.get('/stock', [SyncControllerV2, 'syncStock'])
  })
  .prefix('api/sync')

router
  .group(() => {
    router.get('/sincronizar-productos', [SyncControllerV2, 'syncProducts'])
    router.get('/sincronizar-packs', [SyncControllerV2, 'syncPacks'])
    router.get('/sincronizar-stock', [SyncControllerV2, 'syncStock'])
  })
  .prefix('api/')

router
  .group(() => {
    router.get('/productos', [SyncControllerV2, 'syncProducts'])
    router.get('/packs', [SyncControllerV2, 'syncPacks'])
    router.get('/stock', [SyncControllerV2, 'syncStock'])
  })
  .prefix('api/sync/v1')
