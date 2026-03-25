export interface PackItem {
  product: string
  quantity: number
  is_variant?: boolean
  variant_id?: number
}

export interface PackProduct {
  id: number
  items_packs?: PackItem[]
  itemsPacks?: PackItem[]
  variants?: Array<{ id: number; product_id: number }>
}
