import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const VariantController = () => import('#controllers/variants/variant_controller')

// Rutas de variantes
router
  .group(() => {
    router.get('/variants', [VariantController, 'index']).use(middleware.readCommitted())
    router
      .get('/variants/paginated', [VariantController, 'indexPaginated'])
      .use(middleware.readCommitted())
    router
      .get('/variants/by-channel', [VariantController, 'byChannel'])
      .use(middleware.readCommitted())
    router
      .post('/variants/formatted-by-ids', [VariantController, 'getFormattedByIds'])
      .use(middleware.readCommitted())
  })
  .prefix('api')
