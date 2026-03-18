import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const ChannelsController = () => import('#controllers/channels/channels_controller')

// Rutas de canales
router
  .group(() => {
    router.get('/channels', [ChannelsController, 'index'])
    router.get('/channels/with-products', [ChannelsController, 'withProducts'])
    router.get('/channels/by-country', [ChannelsController, 'byCountry'])
    router.get('/channels/name/:name', [ChannelsController, 'showByName'])
    router.get('/channels/:id', [ChannelsController, 'show']).where('id', router.matchers.number())
    router.post('/channels', [ChannelsController, 'store'])
    router
      .put('/channels/:id', [ChannelsController, 'update'])
      .where('id', router.matchers.number())
    router
      .delete('/channels/:id', [ChannelsController, 'destroy'])
      .where('id', router.matchers.number())
  })
  .use(middleware.m2mAuth())
  .use(middleware.rateLimit({ max: 60, windowMs: 60_000, key: 'ip' }))
  .prefix('api')
