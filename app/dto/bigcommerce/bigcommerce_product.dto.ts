/**
 * DTOs para productos de Bigcommerce
 * Interfaces que definen la estructura de datos que devuelve la API de Bigcommerce
 */

/**
 * 📸 Imagen de producto de Bigcommerce
 */
export interface BigcommerceProductImage {
  id: number
  product_id: number
  is_thumbnail: boolean
  sort_order: number
  description: string
  image_file: string
  url_zoom: string
  url_standard: string
  url_thumbnail: string
  url_tiny: string
  date_modified: string
}

/**
 * Variante de producto de Bigcommerce
 */
export interface BigcommerceProductVariant {
  id: number
  product_id: number
  sku: string
  sku_id: number | null
  price: number
  calculated_price: number
  sale_price: number
  retail_price: number
  map_price: number
  weight: number
  width: number
  height: number
  depth: number
  is_free_shipping: boolean
  fixed_cost_shipping_price: number
  calculated_weight: number
  purchasing_disabled: boolean
  purchasing_disabled_message: string
  image_url: string
  cost_price: number
  upc: string
  mpn: string
  gtin: string
  inventory_level: number
  inventory_warning_level: number
  bin_picking_number: string
  option_values: any[]
}

/**
 * 🎁 Opción de regalo de Bigcommerce
 */
export interface BigcommerceGiftWrappingOption {
  id: number
  name: string
  price: number
}

/**
 * URL personalizada de Bigcommerce
 */
export interface BigcommerceCustomUrl {
  url: string
  is_customized: boolean
}

/**
 * Producto completo de Bigcommerce
 */
export interface BigcommerceProduct {
  id: number
  name: string
  type: string
  sku: string
  description: string
  weight: number
  width: number
  depth: number
  height: number
  price: number
  cost_price: number
  retail_price: number
  sale_price: number
  map_price: number
  tax_class_id: number
  product_tax_code: string
  calculated_price: number
  categories: number[]
  brand_id: number
  option_set_id: number | null
  option_set_display: string
  inventory_level: number
  inventory_warning_level: number
  inventory_tracking: string
  reviews_rating_sum: number
  reviews_count: number
  total_sold: number
  fixed_cost_shipping_price: number
  is_free_shipping: boolean
  is_visible: boolean
  is_featured: boolean
  related_products: number[]
  warranty: string
  bin_picking_number: string
  layout_file: string
  upc: string
  mpn: string
  gtin: string
  date_last_imported: string
  search_keywords: string
  availability: string
  availability_description: string
  gift_wrapping_options_type: string
  gift_wrapping_options_list: BigcommerceGiftWrappingOption[]
  sort_order: number
  condition: string
  is_condition_shown: boolean
  order_quantity_minimum: number
  order_quantity_maximum: number
  page_title: string
  meta_keywords: string[]
  meta_description: string
  date_created: string
  date_modified: string
  view_count: number
  preorder_release_date: string | null
  preorder_message: string
  is_preorder_only: boolean
  is_price_hidden: boolean
  price_hidden_label: string
  custom_url: BigcommerceCustomUrl
  base_variant_id: number
  open_graph_type: string
  open_graph_title: string
  open_graph_description: string
  open_graph_use_meta_description: boolean
  open_graph_use_product_name: boolean
  open_graph_use_image: boolean
  variants: BigcommerceProductVariant[]
  images: BigcommerceProductImage[]
  options?: any[]
}

/**
 * Respuesta de la API de Bigcommerce para productos
 */
export interface BigcommerceProductsResponse {
  data: BigcommerceProduct[]
  meta: {
    pagination: {
      total: number
      count: number
      per_page: number
      current_page: number
      total_pages: number
      links: {
        current: string
        next?: string
        previous?: string
      }
    }
  }
}

export interface BigcommerceProductChannelResponse {
  data: BigcommerceProductChannelAssignment[]
}
/**
 * Asignación simple de producto a canal de Bigcommerce
 */
export interface BigcommerceProductChannelAssignment {
  product_id: number
  channel_id: number
}

/**
 * Asignación completa de producto a canal de Bigcommerce
 */
export interface BigcommerceProductChannelAssignmentFull {
  product_id: number
  channel_id: number
  is_visible: boolean
  date_created: string
  date_modified: string
}

/**
 * Respuesta de la API de Bigcommerce para asignaciones de productos por canal
 */
export interface BigcommerceProductChannelResponse {
  data: BigcommerceProductChannelAssignment[]
  meta: {
    pagination: {
      total: number
      count: number
      per_page: number
      current_page: number
      total_pages: number
      links: {
        current: string
        next?: string
        previous?: string
      }
    }
  }
}
