import router from '@adonisjs/core/services/router'

const CategoryProductsController = () =>
  import('#controllers/category_products/category_products_controller')

router
  .group(() => {
    router.get('/category-products/paginated', [CategoryProductsController, 'indexPaginated'])
    router.get('/category-products/by-channel', [CategoryProductsController, 'byChannel'])
  })
  .prefix('api')
