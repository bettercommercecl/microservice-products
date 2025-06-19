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


router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Rutas de productos
router.group(() => {
  router.get('/products', [ProductsController, 'index'])
  router.get('/products/:id', [ProductsController, 'show'])
  router.get('/sincronizar-productos', [ProductsController, 'sync'])
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
