import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const OptionsController = () => import('#controllers/options/options_controller')

router
  .group(() => {
    router.get('/options/paginated', [OptionsController, 'indexPaginated'])
    router.get('/options/by-channel', [OptionsController, 'byChannel'])
  })
  .use(middleware.m2mAuth())
  .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
  .prefix('api')
