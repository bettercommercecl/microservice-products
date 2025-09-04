import { BigcommerceProductVariant } from '#dto/bigcommerce/bigcommerce_product.dto'
import { ChannelConfigInterface } from './channel_interface.js'
import { DateTime } from 'luxon'

/**
 * 🏷️ Interfaz para la configuración de procesamiento de productos
 * Extrae solo los campos necesarios de ChannelConfigInterface usando Pick
 */
export type ProductProcessingConfig = Pick<
  ChannelConfigInterface,
  | 'ID_SAMEDAY'
  | 'ID_24HORAS'
  | 'ID_PICKUP_IN_STORE'
  | 'ID_TURBO'
  | 'ID_FREE_SHIPPING'
  | 'PERCENT_DISCOUNT_TRANSFER_PRICE'
  | 'ID_RESERVE'
>

/**
 * 🏷️ Interfaz para los valores de opciones de variantes
 */
export interface VariantOptionValue {
  id: number
  label: string
  option_id: number
  option_display_name: string
}

/**
 * 🏷️ Interfaz para variantes de productos
 */
export interface FormattedVariant {
  // Identificadores y información básica
  variant_id: number
  product_id: number
  sku: string
  title: string
  description: string
  type: 'variant'
  brand_id: number | null

  // Categorización y organización
  categories: string

  // Imágenes y recursos visuales
  image: string
  images: string | null
  hover: string

  // SEO y metadatos
  page_title: string
  url: string

  // Control de inventario
  quantity: number
  stock: number
  warning_stock: number

  // Estructura de precios
  normal_price: number
  discount_price: number
  cash_price: number
  discount_rate: string

  // Campos de visibilidad
  is_visible: boolean

  // Opciones de variante
  option_values?: VariantOptionValue[]
}

/**
 * 🏷️ Interfaz para productos formateados listos para la base de datos
 * Representa la estructura de datos que se guarda en la tabla 'products'
 */
export interface FormattedProduct {
  // Identificadores y información básica
  id: number
  product_id: number
  title: string
  description: string
  type: 'product' | 'variation'
  brand_id: number | null

  // Categorización y organización
  categories: string
  reserve: string

  // Imágenes y recursos visuales
  image: string
  images: string | null
  hover: string

  // SEO y metadatos
  page_title: string
  url: string

  // Control de inventario
  quantity: number
  stock: number
  warning_stock: number

  // Estructura de precios
  normal_price: number
  discount_price: number
  cash_price: number
  percent: string

  // Campos especiales del negocio
  reviews: any | null
  sameday: boolean
  despacho24horas: boolean
  pickup_in_store: boolean
  turbo: boolean
  free_shipping: boolean

  // Configuración de ofertas temporales
  timer_status: boolean
  timer_price: number
  timer_datetime: DateTime | null

  // Control de visibilidad
  is_visible: boolean

  // Campos adicionales requeridos por la migración
  meta_description: string
  meta_keywords: string | null
  sizes: string | null
  sort_order: number
  total_sold: number
  weight: number
  armed_cost: number
  featured: boolean
  related_products: string

  // Variantes del producto
  variants: BigcommerceProductVariant[]
}

// Re-exportar la interfaz de variantes formateadas
export type { FormattedVariantForModel } from './formatted_variant_for_model.interface.js'
import type { FormattedVariantForModel } from './formatted_variant_for_model.interface.js'

/**
 * 🏷️ Tipo para productos con variantes formateadas según el modelo
 */
export type FormattedProductWithModelVariants = Omit<FormattedProduct, 'variants'> & {
  variants: FormattedVariantForModel[]
}
