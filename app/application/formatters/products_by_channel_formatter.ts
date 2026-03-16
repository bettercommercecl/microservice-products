import type { ProductForFormatDTO } from '#application/dto/product_format.dto'
import type { SizesConfig } from '#application/dto/sizes_config.dto'
import type { CalculationPort } from '#application/ports/calculation.port'
import { getSizesByProduct } from '#application/formatters/get_sizes_by_product'

export interface FormatProductForMarcasOptions {
  percentTransfer: number
  idPacks?: number
  sizesConfig: SizesConfig
}

/** Estructura que esperan las marcas para guardar . */
export interface ProductForMarcas {
  product_id: number
  image: string
  images?: unknown[]
  hover: string
  title: string
  page_title: string
  description: string
  brand_id: number | null
  categories_array: string
  stock: number
  warning_stock: number
  normal_price: number
  discount_price: number | null
  cash_price: number
  percent: string
  url: string
  type: string
  quantity: number
  armed_cost: number
  weight: number | string
  sort_order: number
  reserve?: string
  reviews?: unknown
  sameday?: boolean
  despacho24horas?: boolean
  free_shipping?: boolean
  pickup_in_store?: boolean
  featured: boolean
  is_visible: boolean
  sizes?: unknown
  turbo?: boolean
  meta_keywords?: string | null
  meta_description?: string | null
  timer_status?: boolean
  timer_price?: number | null
  timer_datetime?: string | null
  nextday?: boolean
  total_sold: number
}

function parseImages(images: unknown): Array<{ is_thumbnail?: boolean; url_standard?: string; description?: string }> {
  if (!images) return []
  if (Array.isArray(images)) return images
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function parseCategories(categories: unknown): number[] {
  if (Array.isArray(categories)) return categories
  if (typeof categories === 'string') {
    try {
      const parsed = JSON.parse(categories)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/**
 * Formatea un producto (DTO) al formato que consumen y guardan las marcas.
 * Recibe DTO y port de calculos para no depender de #models ni #services.
 */
export async function formatProductForMarcas(
  product: ProductForFormatDTO,
  calculation: CalculationPort,
  options: FormatProductForMarcasOptions
): Promise<ProductForMarcas> {
  const { percentTransfer, idPacks, sizesConfig } = options

  const images = parseImages(product.images)
  const categories = parseCategories(product.categories)
  const thumbnail = images.find((img) => (img as { is_thumbnail?: boolean }).is_thumbnail)
  const hoverImg = images.find((img) =>
    String((img as { description?: string }).description || '').includes('hover')
  )

  const normalPrice = Number(product.normal_price) || 0
  const discountPrice = product.discount_price != null ? Number(product.discount_price) : null
  const cashPrice = calculation.calculateTransferPrice(
    normalPrice,
    discountPrice ?? normalPrice,
    percentTransfer
  )
  const percent = calculation.calculateDiscount(normalPrice, discountPrice ?? normalPrice)

  const variants = product.variants ?? []
  const type = product.type || (variants.length > 1 ? 'variation' : 'product')

  const sizes = getSizesByProduct(categories, sizesConfig)

  const result: ProductForMarcas = {
    product_id: product.id,
    image: (thumbnail as { url_standard?: string })?.url_standard || product.image || '',
    ...(images.length > 0 ? { images: [...images].reverse() } : {}),
    hover: (hoverImg as { url_standard?: string })?.url_standard || product.hover || '',
    title: product.title ?? '',
    page_title: product.page_title ?? '',
    description: product.description ?? '',
    brand_id: product.brand_id ?? null,
    categories_array: JSON.stringify(categories),
    stock: Number(product.stock) ?? 0,
    warning_stock: Number(product.warning_stock) ?? 0,
    normal_price: normalPrice,
    discount_price: discountPrice,
    cash_price: cashPrice,
    percent,
    url: product.url || '/',
    type,
    quantity: Number(product.quantity) ?? 0,
    armed_cost: Number(product.armed_cost) ?? 0,
    weight: product.weight ?? 0,
    sort_order: Number(product.sort_order) ?? 0,
    featured: Boolean(product.featured),
    is_visible: Boolean(product.is_visible),
    total_sold: Number(product.total_sold) ?? 0,
  }

  const isPack = idPacks != null && categories.includes(Number(idPacks))
  if (!isPack) {
    result.reserve = product.reserve ?? ''
  } else if (product.reserve) {
    result.reserve = ''
  }

  if (product.reviews != null && typeof product.reviews === 'object' && Object.keys(product.reviews).length > 0) {
    result.reviews = product.reviews
  } else if (product.reviews != null && typeof product.reviews === 'string') {
    try {
      const parsed = JSON.parse(product.reviews) as Record<string, unknown>
      if (parsed && Object.keys(parsed).length > 0) result.reviews = parsed
    } catch {
      // ignore
    }
  }

  result.sameday = product.sameday ?? undefined
  result.despacho24horas = product.despacho24horas ?? undefined
  result.free_shipping = product.free_shipping ?? undefined
  result.pickup_in_store = product.pickup_in_store ?? undefined
  result.turbo = product.turbo ?? undefined
  result.meta_keywords =
    product.meta_keywords && String(product.meta_keywords).length > 0 ? product.meta_keywords : undefined
  result.meta_description =
    product.meta_description && String(product.meta_description).length > 0
      ? product.meta_description
      : undefined
  result.timer_status = product.timer_status ?? undefined
  result.timer_price = product.timer_price
  result.timer_datetime =
    product.timer_datetime != null
      ? typeof product.timer_datetime === 'string'
        ? product.timer_datetime
        : (product.timer_datetime as { toISO?: () => string }).toISO?.() ?? null
      : null
  result.nextday = product.nextday ?? undefined

  result.sizes = sizes

  return result
}
