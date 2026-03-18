import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const PacksController = () => import('#controllers/packs/packs_controller')

router
  .group(() => {
    router
      .get('/packs/paginated', [PacksController, 'indexPaginated'])
      .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
    router
      .get('/packs/by-channel', [PacksController, 'byChannel'])
      .use(middleware.rateLimit({ max: 210, windowMs: 60_000, key: 'ip' }))
  })
  .use(middleware.m2mAuth())
  .prefix('api')
