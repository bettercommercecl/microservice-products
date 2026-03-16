import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const ProductsController = () => import('#controllers/products/products_controller')

// Rutas de productos
router
  .group(() => {
    router.get('/products', [ProductsController, 'index'])
    router.get('/products/paginated', [ProductsController, 'indexPaginated'])
    router.get('/products/by-channel', [ProductsController, 'byChannel'])
    router.get('/products/:id', [ProductsController, 'show'])
    router.get('/sync-stats/:channel_id', [ProductsController, 'getSyncStats'])
  })
  .prefix('api')
