import type {
  InventoryForFormatDTO,
  ReserveForFormatDTO,
  VariantForFormatDTO,
} from '#application/dto/variant_format.dto'
import type { CalculationPort } from '#application/ports/calculation.port'

export interface FormatVariantForMarcasOptions {
  percentTransfer: number
}

/** Estructura que esperan las marcas para variantes por canal. */
export interface VariantForMarcas {
  id: number
  sku: string
  type: 'variant'
  image: string
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
  options: unknown
  related_products: unknown
  reserve?: string
}

function parseImages(variant: VariantForFormatDTO): string[] {
  const img = variant.image
  const images = variant.images
  if (Array.isArray(images) && images.length > 0) {
    return images.map((i) =>
      typeof i === 'string' ? i : (i as { url_standard?: string })?.url_standard || ''
    )
  }
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images) as unknown[]
      if (Array.isArray(parsed)) {
        return parsed.map((i) =>
          typeof i === 'string' ? i : (i as { url_standard?: string })?.url_standard || ''
        )
      }
    } catch {
      // ignore
    }
  }
  return img ? [img] : []
}

/**
 * Formatea una variante (DTO) al formato que consumen las marcas (by-channel).
 * Recibe DTOs y port de calculos para no depender de #models ni #services.
 */
export function formatVariantForMarcas(
  variant: VariantForFormatDTO,
  inventory: InventoryForFormatDTO | null,
  reserve: ReserveForFormatDTO | null,
  calculation: CalculationPort,
  options: FormatVariantForMarcasOptions
): VariantForMarcas {
  const { percentTransfer } = options

  const product = variant.product

  const mainTitle = product.title || ''
  const normalPrice = Number(variant.normal_price) || 0
  const discountPrice = Number(variant.discount_price) ?? normalPrice
  const cashPrice = calculation.calculateTransferPrice(normalPrice, discountPrice, percentTransfer)
  const discountRate =
    variant.discount_rate || calculation.calculateDiscount(normalPrice, discountPrice)

  const imagesVariation = parseImages(variant)
  const image = imagesVariation[0] || variant.image || ''

  const availableToSell = inventory?.available_to_sell ?? Number(variant.stock) ?? 0
  const warningLevel = inventory?.warning_level ?? Number(variant.warning_stock) ?? 0

  // Fecha desde variants.reserve (mapeada al DTO en la capa de servicio)
  const rawReserve = reserve?.fecha_reserva?.trim() || ''
  const reserveValue = rawReserve !== '' ? rawReserve : undefined

  const result: VariantForMarcas = {
    id: variant.id,
    sku: variant.sku,
    type: 'variant',
    image,
    stock: availableToSell,
    main_title: mainTitle,
    normal_price: normalPrice,
    discount_price: discountPrice,
    cash_price: cashPrice,
    discount_rate: discountRate,
    warning_stock: warningLevel,
    images: imagesVariation,
    quantity: 1,
    armed_cost: 0,
    armed_quantity: 1,
    weight: Number(variant.weight) ?? 0,
    height: Number(variant.height) ?? 0,
    width: Number(variant.width) ?? 0,
    depth: Number(variant.depth) ?? 0,
    options: variant.options ?? null,
    related_products: product.related_products ?? null,
  }

  if (reserveValue !== undefined) {
    result.reserve = reserveValue
  }

  return result
}
