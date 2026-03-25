import type { FormattedVariantForModel } from '#interfaces/formatted_variant_for_model.interface'
import type { DateTime } from 'luxon'

// ================================================================
// RESULTADOS DE PRECIOS (compartido entre productos y variantes)
// ================================================================

export interface PriceResult {
  normal_price: number
  discount_price: number
  cash_price: number
  discount: string
}

// ================================================================
// DATOS DE ENRIQUECIMIENTO (pre-cargados en batch)
// ================================================================

export interface ReviewData {
  product_id: number
  quantity: number
  rating: number
  reviews: any[]
}

export interface TimerData {
  timer_status: boolean
  timer_price: number
  timer_datetime: DateTime | null
}

export interface StockData {
  available_to_sell: number
  safety_stock: number
}

export interface SyncEnrichmentData {
  reviewsMap: Map<number, ReviewData>
  timerMap: Map<number, TimerData>
}

// ================================================================
// PRODUCTO FORMATEADO (listo para persistir en tabla products)
// ================================================================

export interface FormattedProduct {
  id: number
  product_id: number
  title: string
  page_title: string
  description: string
  type: 'product' | 'variation'
  brand_id: number | null
  categories: string
  image: string
  images: string | null
  hover: string
  url: string
  stock: number
  warning_stock: number
  quantity: number
  normal_price: number
  discount_price: number
  cash_price: number
  percent: string
  reserve: string
  reviews: string | null
  sameday: boolean
  free_shipping: boolean
  despacho24horas: boolean
  featured: boolean
  pickup_in_store: boolean
  nextday: boolean
  is_visible: boolean
  turbo: boolean
  meta_description: string
  meta_keywords: string | null
  sort_order: number
  total_sold: number
  weight: number
  armed_cost: number
  related_products: string | null
  timer_status: boolean
  timer_price: number
  timer_datetime: DateTime | null
  sizes: string | null
  _channels: number[]
  _raw_categories: number[]
  _raw_variants: any[]
}

/**
 * Producto con variantes ya formateadas, sin _raw_variants.
 * Estructura final que llega a persistencia.
 */
export interface FormattedProductWithVariants extends Omit<FormattedProduct, '_raw_variants'> {
  variants: FormattedVariantForModel[]
}

// ================================================================
// RESULTADOS DE SINCRONIZACION
// ================================================================

export interface SyncResult {
  success: boolean
  message: string
  data: {
    timestamp: string
    processed: {
      products: number
      variants: number
      batches: number
      hidden: number
      totalTime: string
    }
  }
}

export interface BatchResult {
  products: number
  variants: number
  hidden: number
}
