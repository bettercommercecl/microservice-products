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
import './routes/products.js'
import './routes/variants.js'
import './routes/brands.js'
import './routes/categories.js'
import './routes/channels.js'

// Ruta principal
router.get('/', async () => {
  return {
    hello: 'world',
  }
})
