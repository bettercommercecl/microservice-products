/**
 * DTOs de entrada para formatear variante al formato marcas.
 * La capa de aplicacion solo depende de estos tipos, no de modelos Lucid.
 */
export interface VariantForFormatDTO {
  id: number
  product_id: number
  sku: string
  normal_price?: number | string | null
  discount_price?: number | string | null
  discount_rate?: string | null
  image?: string | null
  images?: unknown
  stock?: number | null
  warning_stock?: number | null
  weight?: number | string | null
  height?: number | string | null
  width?: number | string | null
  depth?: number | string | null
  options?: unknown
  product: {
    title?: string | null
    categories?: unknown
    related_products?: unknown
  }
}

export interface InventoryForFormatDTO {
  available_to_sell?: number | null
  warning_level?: number | null
}

export interface ReserveForFormatDTO {
  fecha_reserva?: string | null
}
