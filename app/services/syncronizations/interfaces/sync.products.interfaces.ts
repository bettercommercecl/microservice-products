/**
 * 🏗️ INTERFACES PARA SINCRONIZACIÓN DE PRODUCTOS
 *
 * Este archivo contiene todas las interfaces TypeScript necesarias para
 * la sincronización de productos desde BigCommerce hacia la base de datos local.
 */

/**
 * 📦 Producto de BigCommerce
 * Representa la estructura completa de un producto devuelto por la API de BigCommerce
 */
export interface BigCommerceProduct {
  id: number
  product_id: number
  categories: number[]
  name: string
  description: string
  brand_id: number
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
  images: Array<{
    is_thumbnail: boolean
    url_standard: string
    url_zoom: string
    description: string
    sort_order: number
  }>
  variants: Array<{
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
    value_id: number
  }>
}

/**
 * 🎯 Producto Formateado
 * Representa un producto después de ser procesado por GeneralService
 */
export interface FormattedProduct {
  id: number
  title: string
  url: string
  parent_id?: number
  order?: number
  image?: string
  is_visible?: boolean
  tree_id?: number
}

/**
 * 📊 Item de Stock de Seguridad
 * Representa la información de inventario y stock de seguridad de BigCommerce
 */
export interface SafeStockItem {
  identity: {
    sku: string
    variant_id: number
    product_id: number
  }
  settings: {
    safety_stock: number
    warning_level: number
    bin_picking_number: string
  }
  available_to_sell: number
}

/**
 * 🔄 Variante Formateada
 * Representa una variante de producto después de ser procesada
 */
export interface FormattedVariant {
  id: number
  product_id: number
  title: string
  sku: string
  normal_price: number
  discount_price: number
  cash_price: number
  discount_rate: string
  stock: number
  warning_stock: number
  image: string
  images: string[]
  quantity: number
  armed_cost: number
  armed_quantity: number
  weight: number
  height: number
  width: number
  depth: number
  type: string
  options: string
  main_title: string
}

/**
 * ⚙️ Opción Formateada
 * Representa una opción de producto después de ser procesada
 */
export interface FormattedOption {
  id: number
  product_id: number
  label: string
  options: any[]
  display_name?: string
  name?: string
}

/**
 * 📊 Métricas de Sincronización
 * Contiene estadísticas del proceso de sincronización
 */
export interface SyncMetrics {
  startTime: Date | null
  endTime: Date | null
  totalProducts: number
  errors: string[]
}

/**
 * 📈 Estadísticas de Tracking
 * Contiene el seguimiento detallado de elementos procesados y fallidos
 */
export interface TrackingStats {
  totalProductsProcessed: number
  totalVariantsProcessed: number
  totalOptionsProcessed: number
  totalCategoriesProcessed: number
  failedProducts: Array<{ id: number; error: string }>
  failedVariants: Array<{
    id: number
    sku: string
    product_id: number
    error: string
  }>
  failedOptions: Array<{
    option_id: number
    product_id: number
    error: string
  }>
  failedCategories: Array<{
    product_id: number
    category_id: number
    error: string
  }>
}

/**
 * 🗂️ Relación Categoría-Producto
 * Representa la relación entre un producto y una categoría
 */
export interface CategoryProductRelation {
  product_id: number
  category_id: number
}

/**
 * ⚙️ Opción de Producto
 * Representa una opción de producto para inserción en base de datos
 */
export interface ProductOption {
  label: string
  product_id: number
  option_id: number
  options: string
}

/**
 * 🔄 Variante de Producto
 * Representa una variante de producto para inserción en base de datos
 */
export interface ProductVariant {
  id: number
  product_id: number
  title: string
  sku: string
  normal_price: number
  discount_price: number
  cash_price: number
  discount_rate: string
  stock: number
  warning_stock: number
  image: string
  images: string[]
  quantity: number
  armed_cost: number
  armed_quantity: number
  weight: number
  height: number
  width: number
  depth: number
  type: string
  options: string
}

/**
 * 📊 Estado Actual de Producto
 * Representa el estado actual de un producto en la base de datos
 */
export interface ProductCurrentState {
  categories: number[]
  options: number[]
  variants: number[]
}

/**
 * 📦 Datos Nuevos de Producto
 * Representa los nuevos datos de un producto desde la API
 */
export interface ProductNewData {
  categories: number[]
  options: number[]
  variants: any[]
}

/**
 * 🧹 Relación Obsoleta
 * Representa una relación que debe ser eliminada por estar obsoleta
 */
export interface ObsoleteRelation {
  product_id: number
  category_id?: number
  option_id?: number
  variant_id?: number
  reason: string
}

/**
 * 📊 Reporte de Limpieza
 * Contiene estadísticas de la limpieza de datos obsoletos
 */
export interface CleanupReport {
  categoriesCleaned: number
  optionsCleaned: number
  variantsCleaned: number
}

/**
 * 📊 Reporte de Sincronización
 * Contiene el reporte completo de una sincronización
 */
export interface SyncReport {
  message: string
  total: number
  totalAttempted: number
  totalProcessed: number
  totalFailed: number
  databaseVerification: {
    productsInDB: number
    variantsInDB: number
    categoriesInDB: number
    optionsInDB: number
  }
  tracking: TrackingStats & {
    summary: {
      successRate: {
        products: string
        variants: string
        options: string
        categories: string
      }
    }
  }
}

/**
 * 📊 Reporte de Sincronización Refactorizada
 * Contiene el reporte de la sincronización usando el enfoque refactorizado
 */
export interface RefactoredSyncReport {
  message: string
  phase1: {
    apiProducts: number
    discontinuedProducts: number
  }
  phase2: {
    productsProcessed: number
    categoriesProcessed: number
    optionsProcessed: number
    variantsProcessed: number
  }
  phase3: {
    hiddenCount: number
    errorCount: number
  }
  phase4: CleanupReport
  summary: {
    totalProducts: number
    processedSuccessfully: number
    hiddenDiscontinued: number
    totalCleanup: number
  }
  metrics: {
    startTime: Date | null
    endTime: Date | null
    duration: number
    errors: number
  }
}

/**
 * 📊 Reporte de Salud de Base de Datos
 * Contiene información sobre el estado de salud de la base de datos
 */
export interface DatabaseHealthReport {
  status: 'healthy' | 'unhealthy'
  connection: 'OK' | 'ERROR'
  activeTransactions: number
  pendingLocks: number
  timestamp: string
  error?: string
}

/**
 * 📊 Reporte de Restauración de Opciones
 * Contiene estadísticas de la restauración de opciones desde backup
 */
export interface OptionsRestoreReport {
  status: 'success' | 'error'
  restored: number
  errors: number
  total: number
  message?: string
  detail?: string
}

/**
 * 📊 Reporte de Recuperación de Transacciones
 * Contiene información sobre la recuperación de transacciones abortadas
 */
export interface TransactionRecoveryReport {
  status: 'success' | 'error'
  message: string
  activeTransactions: number
  detail?: string
}
