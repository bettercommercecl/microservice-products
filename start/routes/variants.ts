import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const VariantController = () => import('#controllers/variant_controller')

// Rutas de variantes
router
  .group(() => {
    // Ejemplo de uso: /api/variants?channel=123 para filtrar variantes por canal
    router.get('/variants', [VariantController, 'index'])
    router.post('/variants/formatted-by-ids', [VariantController, 'getFormattedByIds'])
  })
  .prefix('api')
