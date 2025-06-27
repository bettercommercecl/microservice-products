/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import BrandsController from '../app/controllers/BrandsController.js'
import CategoriesController from '../app/controllers/CategoriesController.js'
import ProductsController from '../app/controllers/ProductsController.js'
import VariantController from '#controllers/VariantController'


router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Rutas de productos
router.group(() => {
  router.get('/products', [ProductsController, 'index'])
  router.get('/products/:id', [ProductsController, 'show'])
  router.get('/sincronizar-productos/:channel_id', [ProductsController, 'sync'])
}).prefix('api')

// Rutas de variantes
router.group(() => {
  // Ejemplo de uso: /api/variants?channel=123 para filtrar variantes por canal
  router.get('/variants', [VariantController, 'index'])
  router.post('/variants/formatted-by-ids', [VariantController, 'getFormattedByIds'])
}).prefix('api')

// Rutas de marcas
// router.group(() => {
//   router.get('/brands', [BrandsController, 'index'])
//   router.get('/brands/:id', [BrandsController, 'show'])
// }).prefix('api')

router.group(() => {
  // router.get('/brands', [BrandsController, 'index'])
  router.get('/sincronizar-marcas', [BrandsController, 'sync'])
  // router.get('/brands/:id', [BrandsController, 'show'])
}).prefix('api')

// Rutas de categorías
// router.group(() => {
//   router.get('/categories', [CategoriesController, 'index'])
//   router.get('/categories/:id', [CategoriesController, 'show'])
// }).prefix('api')

router.group(() => {
  // router.get('/categories', [CategoriesController, 'index'])
  router.get('/sincronizar-categorias', [CategoriesController, 'sync'])
  // router.get('/categories/:id', [CategoriesController, 'show'])
}).prefix('api')
