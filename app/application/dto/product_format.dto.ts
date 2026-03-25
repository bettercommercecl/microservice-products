/**
 * DTO de entrada para formatear producto al formato marcas.
 * La capa de aplicacion solo depende de este tipo, no de modelos Lucid.
 */
export interface ProductForFormatDTO {
  id: number
  images?: unknown
  categories?: unknown
  image?: string | null
  hover?: string | null
  normal_price?: number | string | null
  discount_price?: number | string | null
  variants?: unknown[]
  type?: string | null
  title?: string | null
  page_title?: string | null
  description?: string | null
  brand_id?: number | null
  stock?: number | null
  warning_stock?: number | null
  quantity?: number | null
  armed_cost?: number | null
  weight?: number | string | null
  sort_order?: number | null
  featured?: boolean | null
  is_visible?: boolean | null
  total_sold?: number | null
  reserve?: string | null
  reviews?: unknown
  sameday?: boolean | null
  despacho24horas?: boolean | null
  free_shipping?: boolean | null
  pickup_in_store?: boolean | null
  turbo?: boolean | null
  meta_keywords?: string | null
  meta_description?: string | null
  timer_status?: boolean | null
  timer_price?: number | null
  timer_datetime?: unknown
  nextday?: boolean | null
  url?: string | null
}
