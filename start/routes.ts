/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'

// 🚀 Importar todas las rutas organizadas por módulos
import './routes/brands.js'
import './routes/categories.js'
import './routes/channels.js'
import './routes/products.js'
import './routes/sync.js'
import './routes/product_sync.js'
import './routes/variants.js'
import './routes/packs.js'
import './routes/options.js'
import './routes/category_products.js'
import './routes/catalog_safe_stocks.js'

// Ruta principal
router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// 🎯 Ruta para favicon.ico - evitar errores 404
router.get('/favicon.ico', async ({ response }) => {
  return response.status(204).send('') // No Content
})
