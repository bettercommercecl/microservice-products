import { DateTime } from 'luxon'
import { BaseModel, column, hasMany, belongsTo, hasManyThrough } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasMany, HasManyThrough } from '@adonisjs/lucid/types/relations'
import CategoryProduct from './category_product.js'
import Product from './product.js'

export default class Category extends BaseModel {
  protected tableName = 'categories'

  @column({ isPrimary: true })
  declare category_id: number

  @column()
  declare title: string

  @column()
  declare url: string

  @column()
  declare parent_id: number

  @column()
  declare order: number

  @column()
  declare image: string | null

  @column()
  declare is_visible: boolean

  @column()
  declare tree_id: number | null

  @hasMany(() => CategoryProduct)
  declare products: HasMany<typeof CategoryProduct>

  @hasMany(() => Category, {
    foreignKey: 'parent_id',
    localKey: 'category_id',
  })
  declare children: HasMany<typeof Category>

  // ✅ RELACIONES FALTANTES
  @belongsTo(() => Category, {
    foreignKey: 'parent_id',
    localKey: 'category_id',
  })
  declare parent: BelongsTo<typeof Category>

  @hasManyThrough([() => Product, () => CategoryProduct], {
    foreignKey: 'category_id',
    throughForeignKey: 'product_id',
    throughLocalKey: 'category_id',
    localKey: 'category_id',
  })
  declare productsThrough: HasManyThrough<typeof Product>

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime

  // ✅ HELPERS ADICIONALES
  async getProducts() {
    try {
      return await CategoryProduct.query()
        .where('category_id', this.category_id)
        .preload('product')
        .orderBy('product_id', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo productos de la categoría:', error)
      throw error
    }
  }

  async getProductsCount(): Promise<number> {
    try {
      return await CategoryProduct.query()
        .where('category_id', this.category_id)
        .count('* as total')
        .first()
        .then((result) => result?.$extras.total || 0)
    } catch (error) {
      console.error('❌ Error contando productos de la categoría:', error)
      return 0
    }
  }

  async getParentCategory() {
    try {
      if (!this.parent_id) return null
      return await Category.query().where('category_id', this.parent_id).first()
    } catch (error) {
      console.error('❌ Error obteniendo categoría padre:', error)
      throw error
    }
  }

  async getChildCategories() {
    try {
      return await Category.query().where('parent_id', this.category_id).orderBy('order', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo categorías hijas:', error)
      throw error
    }
  }

  async getFullPath(): Promise<string[]> {
    try {
      const path: string[] = [this.title]
      let current = await this.getParentCategory()

      while (current) {
        path.unshift(current.title)
        current = await current.getParentCategory()
      }

      return path
    } catch (error) {
      console.error('❌ Error obteniendo ruta completa:', error)
      return [this.title]
    }
  }

  async isLeaf(): Promise<boolean> {
    try {
      const children = await this.getChildCategories()
      return children.length === 0
    } catch (error) {
      console.error('❌ Error verificando si es hoja:', error)
      return true
    }
  }

  async getDepth(): Promise<number> {
    try {
      const path = await this.getFullPath()
      return path.length - 1
    } catch (error) {
      console.error('❌ Error obteniendo profundidad:', error)
      return 0
    }
  }

  // ✅ MÉTODOS ESTÁTICOS ADICIONALES
  static async getRootCategories() {
    try {
      return await Category.query().whereNull('parent_id').orderBy('order', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo categorías raíz:', error)
      throw error
    }
  }

  static async getCategoryTree() {
    try {
      const rootCategories = await Category.getRootCategories()
      const buildTree = async (categories: any[]): Promise<any[]> => {
        return Promise.all(
          categories.map(async (category) => {
            const children = await category.getChildCategories()
            return {
              ...category.toJSON(),
              children: children.length > 0 ? await buildTree(children) : [],
            }
          })
        )
      }

      return await buildTree(rootCategories)
    } catch (error) {
      console.error('❌ Error construyendo árbol de categorías:', error)
      throw error
    }
  }

  static async getCategoriesByParentId(parentId: number) {
    try {
      return await Category.query().where('parent_id', parentId).orderBy('order', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo categorías por padre:', error)
      throw error
    }
  }
}
