import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'

const CategoryProductsController = () =>
  import('#controllers/category_products/category_products_controller')

router
  .group(() => {
    router.get('/category-products/paginated', [CategoryProductsController, 'indexPaginated'])
    router.get('/category-products/by-channel', [CategoryProductsController, 'byChannel'])
  })
  .use(middleware.m2mAuth())
  .use(middleware.rateLimit({ max: 120, windowMs: 60_000, key: 'ip' }))
  .prefix('api')
