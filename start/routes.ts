/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

// 🚀 Controladores lazy importados
const ProductsController = () => import('#controllers/products_controller')
const VariantController = () => import('#controllers/variant_controller')
const BrandsController = () => import('#controllers/brands_controller')
const CategoriesController = () => import('#controllers/categories_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Rutas de productos
router
  .group(() => {
    router.get('/products', [ProductsController, 'index'])
    router.get('/products/:id', [ProductsController, 'show'])
    router.get('/sincronizar-productos/:channel_id', [ProductsController, 'sync'])
  })
  .prefix('api')

// Rutas de variantes
router
  .group(() => {
    // Ejemplo de uso: /api/variants?channel=123 para filtrar variantes por canal
    router.get('/variants', [VariantController, 'index'])
    router.post('/variants/formatted-by-ids', [VariantController, 'getFormattedByIds'])
  })
  .prefix('api')

// Rutas de marcas
router
  .group(() => {
    router.get('/sincronizar-marcas', [BrandsController, 'sync'])
  })
  .prefix('api')

// Rutas de categorías
router
  .group(() => {
    router.get('/sincronizar-categorias', [CategoriesController, 'sync'])
  })
  .prefix('api')
