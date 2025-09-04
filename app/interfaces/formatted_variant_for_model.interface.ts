/**
 * 🏷️ Interfaz para variantes formateadas según el modelo Variant.ts
 * Representa la estructura de datos que se guarda en la tabla 'variants'
 */
export interface FormattedVariantForModel {
  // Identificadores y información básica
  id: number
  product_id: number
  title: string
  sku: string

  // Estructura de precios
  normal_price: number
  discount_price: number
  cash_price: number
  discount_rate: string

  // Control de inventario
  stock: number
  warning_stock: number

  // Imágenes y recursos visuales
  image: string
  images: string | null

  // Categorización y organización
  categories: number[] | string
  quantity: number

  // Configuración de armado
  armed_cost: number
  armed_quantity: number

  // Dimensiones físicas
  weight: number
  height: number
  depth: number
  width: number

  // Configuración de variante
  type: string
  options: any[] | string | null
  related_products: number[] | string | null
  option_label: string | null
  keywords: string

  // Control de visibilidad
  is_visible: boolean
}
