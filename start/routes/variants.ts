import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

// 🚀 Controlador lazy importado
const VariantController = () => import('#controllers/variant_controller')

// Rutas de variantes
router
  .group(() => {
    // Ejemplo de uso: /api/variants?channel=123 para filtrar variantes por canal
    router.get('/variants', [VariantController, 'index']).use(middleware.readCommitted())
    router
      .post('/variants/formatted-by-ids', [VariantController, 'getFormattedByIds'])
      .use(middleware.readCommitted())
  })
  .prefix('api')
