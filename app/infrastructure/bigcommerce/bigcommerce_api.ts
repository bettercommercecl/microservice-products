import { getBigcommerceClient } from '#infrastructure/http/bigcommerce_client'
import Logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import BrandsApi from './modules/brands/brands.js'
import CategoriesApi from './modules/categories/categories.js'
import InventoryApi from './modules/inventory/inventory.js'
import PacksApi from './modules/packs/packs.js'
import PriceListsApi from './modules/pricelists/pricelists.js'
import ProductsApi from './modules/products/products.js'
import type { ProductOption, ProductVariant } from './modules/variants/variants.js'
import VariantsApi from './modules/variants/variants.js'

/**
 * Fachada central de la API de BigCommerce.
 * Delega a módulos especializados por dominio manteniendo
 * compatibilidad con los servicios que ya consumen esta clase.
 */
export default class BigCommerceService {
  public readonly products: ProductsApi
  public readonly categories: CategoriesApi
  public readonly brands: BrandsApi
  public readonly variants: VariantsApi
  public readonly inventory: InventoryApi
  public readonly priceLists: PriceListsApi
  public readonly packs: PacksApi

  constructor() {
    const client = getBigcommerceClient()
    const logger = Logger.child({ service: 'BigCommerceService' })

    this.products = new ProductsApi(client, logger)
    this.categories = new CategoriesApi(client, logger)
    this.brands = new BrandsApi(client, logger)
    this.variants = new VariantsApi(client, logger)
    this.inventory = new InventoryApi(client, logger)
    this.priceLists = new PriceListsApi(client, logger)
    this.packs = new PacksApi(logger, this.products)
  }

  // ==========================================================================
  // Métodos delegados para compatibilidad con servicios existentes.
  // Los servicios pueden migrar gradualmente a usar los módulos directamente
  // (ej: this.bigcommerceService.products.getById(id))
  // ==========================================================================

  async getBrands(ids: number[] = []) {
    return this.brands.getAll(ids)
  }

  async getCategories() {
    return this.categories.getAll()
  }

  async getProducts() {
    return this.products.getAll()
  }

  async getProductById(id: number) {
    return this.products.getById(id)
  }

  async getVariantsOptionsOfProduct(productId: number): Promise<ProductOption[]> {
    return this.variants.getOptionsByProduct(productId)
  }

  async getVariantsOfProduct(productId: number): Promise<ProductVariant[]> {
    return this.variants.getByProduct(productId)
  }

  async getProductsByChannel(channel: number, page = 1, limit = 2000) {
    return this.products.getByChannel(channel, page, limit)
  }

  async getAllProductsRefactoring(products: number[], visible = 1, parentCategory: number | null) {
    return this.products.getDetailedByIds(products, visible, parentCategory)
  }

  async getSafeStockGlobal(page = 1) {
    return this.inventory.getSafeStockGlobal(page)
  }

  async getMetafieldsByProduct(product: number, key: string) {
    return this.products.getMetafields(product, key)
  }

  async getReviewsByProduct(product: number) {
    return this.products.getReviews(product)
  }

  async getInventoryGlobalReserve(locationId: string, page = 1) {
    return this.inventory.getInventoryGlobalReserve(locationId, page)
  }

  async getAllProductsPacks() {
    return this.packs.getAllProductsPacks()
  }

  async updateCategoryAssignments(assignments: Array<{ product_id: number; category_id: number }>) {
    return this.products.updateCategoryAssignments(assignments)
  }

  async deleteCategoryAssignments(productIds: number[], categoryIds: number[]) {
    return this.products.deleteCategoryAssignments(productIds, categoryIds)
  }

  async updateInventoryLocationItems(
    locationId: string,
    settings: Array<{
      identity?: { sku?: string; variant_id?: number }
      safety_stock?: number
      is_in_stock?: boolean
      warning_level?: number
      bin_picking_number?: string
    }>
  ) {
    return this.inventory.updateLocationItems(locationId, settings)
  }

  async getMetafieldsByPacksVariants(
    variantRefs: Array<{ id: number; product_id: number }>
  ): Promise<Array<{ key: string; value: string }[]>> {
    const key = env.get('PACKS_METAFIELD_KEY', 'packs')
    const results = await Promise.all(
      variantRefs.map((v) => this.variants.getMetafieldsByVariant(v.product_id, v.id, key))
    )
    return results
  }
}
