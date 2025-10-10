// app/Models/Variant.ts
import { DateTime } from 'luxon'
import { BaseModel, column, belongsTo, hasOne } from '@adonisjs/lucid/orm'
import type { BelongsTo, HasOne } from '@adonisjs/lucid/types/relations'
import Product from './product.js'
import CatalogSafeStock from './catalog.safe.stock.js'

export default class Variant extends BaseModel {
  public static table = 'variants'

  @column({ isPrimary: true })
  declare id: number

  @column()
  declare product_id: number

  @column()
  declare title: string

  @column()
  declare sku: string

  @column()
  declare normal_price: number

  @column()
  declare discount_price: number

  @column()
  declare cash_price: number

  @column()
  declare discount_rate: string

  @column()
  declare stock: number

  @column()
  declare warning_stock: number

  @column()
  declare image: string

  @column()
  declare hover: string | null

  @column()
  declare images: string | null
  // Gestión de categorización del producto
  @column({
    serializeAs: 'categories',
    serialize: (value: string) => {
      try {
        return value ? JSON.parse(value) : []
      } catch {
        return []
      }
    },
    prepare: (value: number[]) => {
      return JSON.stringify(value)
    },
  })
  declare categories: number[] | string
  @column()
  declare quantity: number

  @column()
  declare armed_cost: number

  @column()
  declare armed_quantity: number

  @column()
  declare weight: number

  @column()
  declare height: number

  @column()
  declare depth: number

  @column()
  declare width: number

  @column()
  declare type: string

  @column({
    serializeAs: 'options',
    serialize: (value: string) => {
      try {
        return value ? JSON.parse(value) : []
      } catch {
        return []
      }
    },
    prepare: (value: any[]) => {
      return value ? JSON.stringify(value) : null
    },
  })
  declare options: any[] | string | null

  @column({
    serializeAs: 'related_products',
    serialize: (value: string) => {
      try {
        return value ? JSON.parse(value) : []
      } catch {
        return []
      }
    },
    prepare: (value: number[]) => {
      return value ? JSON.stringify(value) : null
    },
  })
  declare related_products: number[] | string | null

  @column()
  declare option_label: string | null

  @column()
  declare keywords: string
  @column()
  declare is_visible: boolean
  // RELACIONES
  @belongsTo(() => Product, {
    foreignKey: 'product_id',
  })
  declare product: BelongsTo<typeof Product>

  @hasOne(() => CatalogSafeStock, {
    foreignKey: 'sku',
    localKey: 'sku',
  })
  declare stockData: HasOne<typeof CatalogSafeStock>

  @column.dateTime({ autoCreate: true, serializeAs: 'created_at' })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true, serializeAs: 'updated_at' })
  declare updatedAt: DateTime

  /**
   * Obtiene variantes con su producto principal
   * @param productId - ID del producto (opcional)
   * @returns Promise<Variant[]> - Variantes con producto preload
   * NECESARIO: Para mostrar variantes con datos del producto
   */
  static async getVariantsWithProduct(productId?: number) {
    try {
      const query = Variant.query().preload('product')

      if (productId) {
        query.where('product_id', productId)
      }

      return await query.orderBy('id', 'asc')
    } catch (error) {
      console.error('Error obteniendo variantes con producto:', error)
      throw error
    }
  }

  /**
   * 👁️ Obtiene solo variantes visibles con su producto
   * @param productId - ID del producto (opcional)
   * @returns Promise<Variant[]> - Variantes visibles con producto
   * NECESARIO: Para mostrar solo variantes activas al público
   */
  static async getVisibleVariantsWithProduct(productId?: number) {
    try {
      const query = Variant.query().where('is_visible', true).preload('product')

      if (productId) {
        query.where('product_id', productId)
      }

      return await query.orderBy('id', 'asc')
    } catch (error) {
      console.error('Error obteniendo variantes visibles:', error)
      throw error
    }
  }

  /**
   * 🚫 Obtiene solo variantes no visibles con su producto
   * @param productId - ID del producto (opcional)
   * @returns Promise<Variant[]> - Variantes ocultas con producto
   * NECESARIO: Para administración y gestión de inventario
   */
  static async getHiddenVariantsWithProduct(productId?: number) {
    try {
      const query = Variant.query().where('is_visible', false).preload('product')

      if (productId) {
        query.where('product_id', productId)
      }

      return await query.orderBy('id', 'asc')
    } catch (error) {
      console.error('Error obteniendo variantes ocultas:', error)
      throw error
    }
  }

  /**
   * Obtiene variantes con datos de stock
   * @param productId - ID del producto (opcional)
   * @returns Promise<Variant[]> - Variantes con stock preload
   * NECESARIO: Para gestión de inventario y stock
   */
  static async getVariantsWithStock(productId?: number) {
    try {
      const query = Variant.query().preload('stockData')

      if (productId) {
        query.where('product_id', productId)
      }

      return await query.orderBy('id', 'asc')
    } catch (error) {
      console.error('Error obteniendo variantes con stock:', error)
      throw error
    }
  }

  /**
   * Obtiene variantes por SKU con producto
   * @param sku - SKU de la variante
   * @returns Promise<Variant | null> - Variante encontrada o null
   * NECESARIO: Para búsquedas específicas por SKU
   */
  static async getVariantBySkuWithProduct(sku: string) {
    try {
      return await Variant.query().where('sku', sku).preload('product').first()
    } catch (error) {
      console.error('Error obteniendo variante por SKU:', error)
      throw error
    }
  }

  /**
   * 📈 Obtiene variantes con stock bajo (warning_stock)
   * @param productId - ID del producto (opcional)
   * @returns Promise<Variant[]> - Variantes con stock bajo
   * NECESARIO: Para alertas de inventario
   */
  static async getVariantsWithLowStock(productId?: number) {
    try {
      const query = Variant.query().whereRaw('stock <= warning_stock').preload('product')

      if (productId) {
        query.where('product_id', productId)
      }

      return await query.orderBy('stock', 'asc')
    } catch (error) {
      console.error('Error obteniendo variantes con stock bajo:', error)
      throw error
    }
  }

  /**
   * 💰 Obtiene variantes con descuento
   * @param productId - ID del producto (opcional)
   * @returns Promise<Variant[]> - Variantes con descuento
   * NECESARIO: Para mostrar ofertas y promociones
   */
  static async getVariantsWithDiscount(productId?: number) {
    try {
      const query = Variant.query()
        .where('discount_price', '>', 0)
        .whereRaw('discount_price < normal_price')
        .preload('product')

      if (productId) {
        query.where('product_id', productId)
      }

      return await query.orderBy('discount_rate', 'desc')
    } catch (error) {
      console.error('Error obteniendo variantes con descuento:', error)
      throw error
    }
  }

  /**
   * Obtiene variantes por categorías
   * @param categoryIds - Array de IDs de categorías
   * @param visibleOnly - Solo variantes visibles (default: true)
   * @returns Promise<Variant[]> - Variantes filtradas por categorías
   * NECESARIO: Para filtros de categorías en frontend
   */
  static async getVariantsByCategories(categoryIds: number[], visibleOnly: boolean = true) {
    try {
      const query = Variant.query().preload('product')

      if (visibleOnly) {
        query.where('is_visible', true)
      }

      // Filtrar por categorías usando JSON contains
      query.whereRaw('categories::jsonb ?| array[?]', [categoryIds.map((id) => id.toString())])

      return await query.orderBy('id', 'asc')
    } catch (error) {
      console.error('Error obteniendo variantes por categorías:', error)
      throw error
    }
  }

  // ========================================
  // HELPERS DE INSTANCIA
  // ========================================

  /**
   * 👁️ Verifica si la variante es visible
   * @returns boolean - true si es visible
   * NECESARIO: Para validaciones en tiempo de ejecución
   */
  isVisible() {
    return this.is_visible === true
  }

  /**
   * Verifica si la variante tiene stock bajo
   * @returns boolean - true si stock <= warning_stock
   * NECESARIO: Para alertas de inventario
   */
  hasLowStock() {
    return this.stock <= this.warning_stock
  }

  /**
   * 💰 Verifica si la variante tiene descuento activo
   * @returns boolean - true si tiene descuento válido
   * NECESARIO: Para mostrar badges de oferta
   */
  hasDiscount() {
    return this.discount_price > 0 && this.discount_price < this.normal_price
  }

  /**
   * Obtiene el precio final (descuento o normal)
   * @returns number - Precio final a mostrar
   * NECESARIO: Para cálculos de precios en frontend
   */
  getFinalPrice() {
    return this.hasDiscount() ? this.discount_price : this.normal_price
  }

  /**
   * Obtiene el porcentaje de descuento
   * @returns number - Porcentaje de descuento (0-100)
   * NECESARIO: Para mostrar porcentajes de descuento
   */
  getDiscountPercentage() {
    if (!this.hasDiscount()) return 0
    return Math.round(((this.normal_price - this.discount_price) / this.normal_price) * 100)
  }
}
