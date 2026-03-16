import router from '@adonisjs/core/services/router'

const OptionsController = () => import('#controllers/options/options_controller')

router
  .group(() => {
    router.get('/options/paginated', [OptionsController, 'indexPaginated'])
    router.get('/options/by-channel', [OptionsController, 'byChannel'])
  })
  .prefix('api')
