import router from '@adonisjs/core/services/router'

// 🚀 Controlador lazy importado
const CategoriesController = () => import('#controllers/categories_controller')

// Rutas de categorías
router
  .group(() => {
    router.get('/categories', [CategoriesController, 'index'])
    router.get('/categories/:id', [CategoriesController, 'show'])
  })
  .prefix('api')
