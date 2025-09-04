// ✅ INTERFACES PARA FILTROS Y BÚSQUEDA EN MODELOS

export interface ProductFilters {
  // ✅ Filtros básicos
  name?: string
  sku?: string
  brand_id?: number
  category_id?: number
  channel_id?: number

  // ✅ Filtros de estado
  is_visible?: boolean
  is_featured?: boolean
  availability?: string
  condition?: string

  // ✅ Filtros de precios
  min_price?: number
  max_price?: number
  has_discount?: boolean

  // ✅ Filtros de inventario
  in_stock?: boolean
  low_stock?: boolean
  out_of_stock?: boolean

  // ✅ Filtros de fechas
  created_after?: Date
  created_before?: Date
  updated_after?: Date
  updated_before?: Date

  // ✅ Filtros de búsqueda
  search?: string
  search_fields?: string[]

  // ✅ Paginación
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface VariantFilters {
  // ✅ Filtros básicos
  product_id?: number
  sku?: string
  option_id?: number

  // ✅ Filtros de precios
  min_price?: number
  max_price?: number
  has_sale_price?: boolean

  // ✅ Filtros de inventario
  in_stock?: boolean
  low_stock?: boolean
  out_of_stock?: boolean

  // ✅ Filtros de peso
  min_weight?: number
  max_weight?: number

  // ✅ Paginación
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface CategoryFilters {
  // ✅ Filtros básicos
  name?: string
  parent_id?: number
  has_products?: boolean

  // ✅ Filtros de estado
  is_active?: boolean

  // ✅ Filtros de jerarquía
  depth?: number
  is_leaf?: boolean

  // ✅ Paginación
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface BrandFilters {
  // ✅ Filtros básicos
  name?: string
  has_products?: boolean

  // ✅ Filtros de estado
  is_active?: boolean

  // ✅ Paginación
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface ChannelFilters {
  // ✅ Filtros básicos
  name?: string
  has_products?: boolean

  // ✅ Filtros de estado
  is_active?: boolean

  // ✅ Paginación
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface InventoryFilters {
  // ✅ Filtros básicos
  sku?: string
  product_id?: number
  variant_id?: number

  // ✅ Filtros de stock
  min_stock?: number
  max_stock?: number
  low_stock?: boolean
  out_of_stock?: boolean

  // ✅ Filtros de seguridad
  min_safety_stock?: number
  max_safety_stock?: number

  // ✅ Paginación
  page?: number
  limit?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

// ✅ INTERFACES PARA RESULTADOS PAGINADOS
export interface PaginatedResult<T> {
  data: T[]
  meta: {
    page: number
    limit: number
    total: number
    total_pages: number
    has_next: boolean
    has_prev: boolean
  }
}

// ✅ INTERFACES PARA BÚSQUEDA AVANZADA
export interface SearchOptions {
  query: string
  fields?: string[]
  fuzzy?: boolean
  case_sensitive?: boolean
  exact_match?: boolean
}

export interface SortOptions {
  field: string
  order: 'asc' | 'desc'
}

// ✅ INTERFACES PARA EXPORTACIÓN/IMPORTACIÓN
export interface ExportOptions {
  format: 'csv' | 'json' | 'xlsx'
  filters?: any
  fields?: string[]
  include_relations?: boolean
}

export interface ImportOptions {
  format: 'csv' | 'json' | 'xlsx'
  validate?: boolean
  update_existing?: boolean
  skip_errors?: boolean
}

// ✅ INTERFACES PARA AUDITORÍA
export interface AuditLog {
  id: number
  model_type: string
  model_id: number
  action: 'create' | 'update' | 'delete'
  old_values?: any
  new_values?: any
  user_id?: number
  ip_address?: string
  user_agent?: string
  created_at: Date
}

// ✅ INTERFACES PARA CACHING
export interface CacheOptions {
  ttl?: number
  key?: string
  tags?: string[]
  refresh?: boolean
}

// ✅ INTERFACES PARA VALIDACIÓN
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
  value?: any
}

// ✅ INTERFACES PARA MÉTRICAS
export interface ModelMetrics {
  total_records: number
  active_records: number
  inactive_records: number
  last_updated: Date
  sync_status: 'success' | 'error' | 'pending'
  error_count: number
}
