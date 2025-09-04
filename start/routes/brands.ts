import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const BrandsController = () => import('#controllers/brands_controller')

// Rutas de marcas
router
  .group(() => {
    router.get('/sincronizar-marcas', [BrandsController, 'sync'])
  })
  .prefix('api')
