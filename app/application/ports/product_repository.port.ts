/**
 * Contrato para lectura de productos desde persistencia.
 * La capa de aplicacion depende de este port; infrastructure lo implementa con Lucid.
 */
export interface ProductPaginatedResult {
  data: unknown[]
  meta: {
    total: number
    perPage: number
    currentPage: number
    lastPage: number
    firstPage: number
    firstPageUrl: string
    lastPageUrl: string
    nextPageUrl: string | null
    previousPageUrl: string | null
  }
}

export interface ProductRepositoryPort {
  findAll(): Promise<unknown[]>

  findById(id: number): Promise<unknown | null>

  findPaginated(page: number, limit: number): Promise<ProductPaginatedResult>

  findReviewsPaginated(page: number, limit: number): Promise<ProductPaginatedResult>

  findPaginatedByChannel(
    channelId: number,
    page: number,
    limit: number
  ): Promise<ProductPaginatedResult>
}
