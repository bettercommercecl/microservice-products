/**
 * Puerto del catalogo externo (BigCommerce u otro).
 * La capa de aplicacion depende de esta abstraccion para obtener productos, variantes e inventario.
 */
export interface CatalogProvider {
  getProducts(): Promise<unknown>
  getProductById(id: number): Promise<unknown>
  getProductsByChannel(channel: number, page?: number, limit?: number): Promise<unknown>
  getVariantsOfProduct(productId: number): Promise<unknown>
  getSafeStockGlobal(page?: number): Promise<unknown>
  getInventoryGlobalReserve(locationId: string, page?: number): Promise<unknown>
  getAllProductsPacks(): Promise<unknown>
  updateCategoryAssignments(
    assignments: Array<{ product_id: number; category_id: number }>
  ): Promise<void>
  deleteCategoryAssignments(productIds: number[], categoryIds: number[]): Promise<void>
  updateInventoryLocationItems(
    locationId: string,
    settings: Array<{
      identity?: { sku?: string; variant_id?: number }
      safety_stock?: number
      is_in_stock?: boolean
      warning_level?: number
      bin_picking_number?: string
    }>
  ): Promise<unknown>
}
