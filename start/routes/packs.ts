import router from '@adonisjs/core/services/router'

const PacksController = () => import('#controllers/packs/packs_controller')

router
  .group(() => {
    router.get('/packs/paginated', [PacksController, 'indexPaginated'])
    router.get('/packs/by-channel', [PacksController, 'byChannel'])
  })
  .prefix('api')
