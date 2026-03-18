import { middleware } from '#start/kernel'
import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const CategoriesController = () => import('#controllers/categories/categories_controller')

// Rutas de categorías
router
  .group(() => {
    router.get('/categories', [CategoriesController, 'index'])
    router.get('/categories/:id', [CategoriesController, 'show'])
  })
  .use(middleware.m2mAuth())
  .use(middleware.rateLimit({ max: 60, windowMs: 60_000, key: 'ip' }))
  .prefix('api')
