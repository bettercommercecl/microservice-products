import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import Product from './product.js'
import Category from './category.js'

export default class CategoryProduct extends BaseModel {
  public static table = 'category_products'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare product_id: number

  @column()
  declare category_id: number

  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @belongsTo(() => Category, {
    foreignKey: 'category_id',
  })
  declare category: BelongsTo<typeof Category>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // ✅ MÉTODOS PARA OPERACIONES MASIVAS
  static async syncCategoriesForProduct(productId: number, categoryIds: number[]) {
    try {
      // ✅ 1. Eliminar categorías existentes del producto
      await CategoryProduct.query().where('product_id', productId).delete()

      // ✅ 2. Crear nuevas relaciones
      if (categoryIds.length > 0) {
        const categoriesToCreate = categoryIds.map((categoryId) => ({
          product_id: productId,
          category_id: categoryId,
        }))

        await CategoryProduct.createMany(categoriesToCreate)
      }

      return true
    } catch (error) {
      console.error('❌ Error sincronizando categorías:', error)
      throw error
    }
  }

  static async attachCategoriesToProduct(productId: number, categoryIds: number[]) {
    try {
      // ✅ Verificar que no existan duplicados
      const existingCategories = await CategoryProduct.query()
        .where('product_id', productId)
        .whereIn('category_id', categoryIds)
        .select('category_id')

      const existingCategoryIds = existingCategories.map((cat) => cat.category_id)
      const newCategoryIds = categoryIds.filter((id) => !existingCategoryIds.includes(id))

      if (newCategoryIds.length > 0) {
        const categoriesToCreate = newCategoryIds.map((categoryId) => ({
          product_id: productId,
          category_id: categoryId,
        }))

        await CategoryProduct.createMany(categoriesToCreate)
      }

      return true
    } catch (error) {
      console.error('❌ Error adjuntando categorías:', error)
      throw error
    }
  }

  static async detachCategoriesFromProduct(productId: number, categoryIds: number[]) {
    try {
      await CategoryProduct.query()
        .where('product_id', productId)
        .whereIn('category_id', categoryIds)
        .delete()

      return true
    } catch (error) {
      console.error('❌ Error desadjuntando categorías:', error)
      throw error
    }
  }

  static async updateOrCreateCategoryProduct(productId: number, categoryId: number) {
    try {
      return await CategoryProduct.updateOrCreate(
        { product_id: productId, category_id: categoryId },
        {
          product_id: productId,
          category_id: categoryId,
        }
      )
    } catch (error) {
      console.error('❌ Error actualizando/creando relación categoría-producto:', error)
      throw error
    }
  }

  static async bulkCreateCategoryProducts(relationsData: any[]) {
    try {
      return await CategoryProduct.createMany(relationsData)
    } catch (error) {
      console.error('❌ Error creando relaciones masivamente:', error)
      throw error
    }
  }

  static async getCategoriesByProductId(productId: number) {
    try {
      return await CategoryProduct.query()
        .where('product_id', productId)
        .preload('category')
        .orderBy('category_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo categorías del producto:', error)
      throw error
    }
  }

  static async getProductsByCategoryId(categoryId: number) {
    try {
      return await CategoryProduct.query()
        .where('category_id', categoryId)
        .preload('product')
        .orderBy('product_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo productos de la categoría:', error)
      throw error
    }
  }
}
