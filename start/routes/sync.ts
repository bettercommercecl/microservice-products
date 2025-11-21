import router from '@adonisjs/core/services/router'

const SyncController = () => import('#controllers/sync_controller')

router
  .group(() => {
    router.get('/sincronizar-productos/:channel_id', [SyncController, 'syncProducts'])
    router.get('/sincronizar-categorias', [SyncController, 'syncCategories'])
    router.get('/sincronizar-marcas', [SyncController, 'syncBrands'])
    router.get('/sincronizar-canales', [SyncController, 'syncChannels'])
  })
  .prefix('api')
