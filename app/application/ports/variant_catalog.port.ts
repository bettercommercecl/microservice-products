/**
 * Contrato para obtencion de variantes (lectura).
 * La capa de aplicacion depende de este port; infrastructure lo implementa.
 */
export interface VariantsPaginatedMeta {
  total: number
  perPage: number
  currentPage: number
  lastPage: number
}

export interface VariantCatalogPort {
  getVariantsPaginatedTableShape(
    page: number,
    limit: number
  ): Promise<{
    data: Record<string, unknown>[]
    meta: VariantsPaginatedMeta
  }>

  getVariantsByChannelForMarcas(
    channelId: number,
    page: number,
    limit: number
  ): Promise<{
    data: unknown[]
    meta: VariantsPaginatedMeta
  }>
}
