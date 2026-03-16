/**
 * Contrato para lectura de variantes desde persistencia.
 * La capa de aplicacion depende de este port; infrastructure lo implementa con Lucid.
 */
export interface VariantPaginatedMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

export interface VariantRepositoryPort {
  findAll(): Promise<unknown[]>

  findByIds(ids: number[]): Promise<unknown[]>

  findPaginatedTableShape(
    page: number,
    limit: number,
    channelId?: number
  ): Promise<{ data: Record<string, unknown>[]; meta: VariantPaginatedMeta }>

  findPaginatedByChannelWithProduct(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{ data: unknown[]; meta: VariantPaginatedMeta }>
}
