import { middleware } from '#start/kernel'

import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const BrandsController = () => import('#controllers/brands/brands_controller')

// Rutas de marcas
router
  .group(() => {
    router.get('/brands', [BrandsController, 'index'])
    router.get('/brands/:id', [BrandsController, 'show'])
  })
  .use(middleware.rateLimit({ max: 60, windowMs: 60_000, key: 'ip' }))
  .prefix('api')
