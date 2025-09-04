import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const ChannelsController = () => import('#controllers/channels_controller')

// Rutas de canales
router
  .group(() => {
    // 🔍 Rutas generales
    router.get('/channels', [ChannelsController, 'index'])
    router.get('/channels/name/:name', [ChannelsController, 'showByName'])
    router.get('/channels/:id', [ChannelsController, 'show']).where('id', router.matchers.number())
    router.get('/channels/with-products', [ChannelsController, 'withProducts'])
    router.get('/channels/sync', [ChannelsController, 'sync'])
  })
  .prefix('api')
