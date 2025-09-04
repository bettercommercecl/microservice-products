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

  /**
   * 📦 Obtiene todos los productos de esta categoría
   * @returns Promise<CategoryProduct[]> - Lista de productos con preload
   */
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

  /**
   * 🔢 Cuenta el total de productos en esta categoría
   * @returns Promise<number> - Número total de productos
   */
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

  /**
   * 👆 Obtiene la categoría padre de esta categoría
   * @returns Promise<Category | null> - Categoría padre o null si es raíz
   */
  async getParentCategory() {
    try {
      if (!this.parent_id) return null
      return await Category.query().where('category_id', this.parent_id).first()
    } catch (error) {
      console.error('❌ Error obteniendo categoría padre:', error)
      throw error
    }
  }

  /**
   * 👶 Obtiene todas las categorías hijas de esta categoría
   * @returns Promise<Category[]> - Lista de categorías hijas ordenadas
   */
  async getChildCategories() {
    try {
      return await Category.query().where('parent_id', this.category_id).orderBy('order', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo categorías hijas:', error)
      throw error
    }
  }

  /**
   * 🛤️ Obtiene la ruta completa desde la raíz hasta esta categoría
   * @returns Promise<string[]> - Array con los nombres de categorías en orden jerárquico
   */
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

  /**
   * 🍃 Verifica si esta categoría es una hoja (sin categorías hijas)
   * @returns Promise<boolean> - true si es hoja, false si tiene hijos
   */
  async isLeaf(): Promise<boolean> {
    try {
      const children = await this.getChildCategories()
      return children.length === 0
    } catch (error) {
      console.error('❌ Error verificando si es hoja:', error)
      return true
    }
  }

  /**
   * 📏 Calcula la profundidad de esta categoría en el árbol jerárquico
   * @returns Promise<number> - Nivel de profundidad (0 = raíz)
   */
  async getDepth(): Promise<number> {
    try {
      const path = await this.getFullPath()
      return path.length - 1
    } catch (error) {
      console.error('❌ Error obteniendo profundidad:', error)
      return 0
    }
  }

  /**
   * 🌳 Obtiene todas las categorías raíz (sin padre)
   * @returns Promise<Category[]> - Lista de categorías raíz ordenadas
   */
  static async getRootCategories() {
    try {
      return await Category.query().whereNull('parent_id').orderBy('order', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo categorías raíz:', error)
      throw error
    }
  }

  /**
   * 🌲 Construye el árbol completo de categorías con sus hijos anidados
   * @returns Promise<any[]> - Árbol de categorías con estructura jerárquica
   */
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

  /**
   * 👶 Obtiene todas las categorías hijas de un padre específico
   * @param parentId - ID de la categoría padre
   * @returns Promise<Category[]> - Lista de categorías hijas ordenadas
   */
  static async getCategoriesByParentId(parentId: number) {
    try {
      return await Category.query().where('parent_id', parentId).orderBy('order', 'asc')
    } catch (error) {
      console.error('❌ Error obteniendo categorías por padre:', error)
      throw error
    }
  }
}
