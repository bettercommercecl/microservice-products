/**
 * Contrato para obtencion de productos (lectura).
 * La capa de aplicacion depende de este port; infrastructure lo implementa.
 */
export interface ProductsPaginatedMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
  firstPage?: number
  firstPageUrl?: string
  lastPageUrl?: string
  nextPageUrl?: string | null
  previousPageUrl?: string | null
}

export interface ProductCatalogPort {
  getProductsPaginated(
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: unknown }>

  getProductReviewsPaginated(
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }>

  getProductsByChannel(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ success: true; data: unknown[]; meta: ProductsPaginatedMeta }>

  getProductById(id: number): Promise<{ success: true; data: unknown }>

  getAllProducts(): Promise<{ success: true; data: unknown }>
}
