import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const ProductsController = () => import('#controllers/products_controller')

// Rutas de productos
router
  .group(() => {
    router.get('/products', [ProductsController, 'index'])
    router.get('/products/:id', [ProductsController, 'show'])
    router.get('/sync-stats/:channel_id', [ProductsController, 'getSyncStats'])
  })
  .prefix('api')
