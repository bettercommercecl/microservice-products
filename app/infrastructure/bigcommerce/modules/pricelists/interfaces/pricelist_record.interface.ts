export interface BulkPricingTier {
  quantity_min: number
  quantity_max: number
  type: string
  amount: number
}

export interface PriceListRecord {
  price_list_id: number
  variant_id: number
  price: number
  sale_price: number
  retail_price: number
  map_price: number
  calculated_price: number
  date_created: string
  date_modified: string
  currency: string
  product_id: number
  sku?: string
  bulk_pricing_tiers: BulkPricingTier[]
}

export interface PriceListRecordsParams {
  'variant_id:in'?: number[]
  'product_id:in'?: number[]
  'sku:in'?: string[]
  'currency'?: string
  'currency:in'?: string[]
  'include'?: ('bulk_pricing_tiers' | 'sku')[]
  'page'?: number
  'limit'?: number
  'price'?: number
  'price:min'?: number
  'price:max'?: number
  'sale_price'?: number
  'sale_price:min'?: number
  'sale_price:max'?: number
}

export interface PriceListPagination {
  total: number
  count: number
  per_page: number
  current_page: number
  total_pages: number
}

export interface PriceListRecordsResponse {
  data: PriceListRecord[]
  meta: {
    pagination?: PriceListPagination
  }
}
