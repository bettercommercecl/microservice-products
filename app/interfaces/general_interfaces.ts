export interface ProductImage {
  is_thumbnail: boolean
  url_standard: string
  url_zoom: string
  description: string
  sort_order: number
}

export interface ProductVariant {
  id: number
  sku: string
  price: number
  sale_price: number | null
  calculated_price: number
  inventory_level: number
  calculated_weight: number
  width: number
  depth: number
  height: number
  image_url: string
  option_values: any[]
}

export interface Product {
  id: number
  name: string
  description: string
  brand_id: number
  categories: number[]
  price: number
  sale_price: number
  inventory_level: number
  quantity: number
  weight: number
  width: number
  depth: number
  height: number
  sort_order: number
  is_featured: boolean
  is_visible: boolean
  meta_keywords?: string[]
  meta_description?: string
  custom_url?: {
    url: string
  }
  images: ProductImage[]
  variants: ProductVariant[]
  reviews?: any
  sizes?: any
}

export interface OptionValue {
  id: number
  label: string
  value_data?: {
    colors?: any
    image_url?: string
  }
}

export interface ProductOption {
  id: number
  display_name: string
  product_id: number
  option_values: OptionValue[]
}

export interface FormattedOption {
  id: number
  label: string
  value_data: any
}

export interface FormattedProductOption {
  id: number
  label: string
  product_id: number
  options: FormattedOption[]
}

export interface FormattedVariant {
  id: number
  product_id: number
  title: string
  sku: string
  type: string
  image: string
  hover?: string
  stock: number
  main_title: string
  normal_price: number
  discount_price: number
  cash_price: number
  discount_rate: string
  warning_stock: number
  images: string[]
  quantity: number
  armed_cost: number
  armed_quantity: number
  weight: number
  height: number
  width: number
  depth: number
  keywords?: string | null
  option_label?: string | null
  options?: string
}

export interface SafeStockItem {
  id: number
  product_id: number
  sku: string
  variant_id: number | null
  safety_stock: number
  warning_level: number
  available_to_sell: number
  bin_picking_number: string | null
  createdAt: Date
  updatedAt: Date
}
