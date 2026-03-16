import type {
  InventoryForFormatDTO,
  ReserveForFormatDTO,
  VariantForFormatDTO,
} from '#application/dto/variant_format.dto'
import type CatalogSafeStock from '#models/catalog_safe_stock'
import type InventoryReserve from '#models/inventory_reserve'
import type Variant from '#models/variant'

/**
 * Mapea modelo Lucid Variant (con product preload) a DTO de entrada del formatter.
 */
export function toVariantForFormatDTO(variant: Variant): VariantForFormatDTO {
  const product = variant.product
  if (!product) {
    throw new Error(`Variant ${variant.id} sin producto preload`)
  }
  return {
    id: variant.id,
    sku: variant.sku,
    normal_price: variant.normal_price,
    discount_price: variant.discount_price,
    discount_rate: variant.discount_rate,
    image: variant.image,
    images: variant.images,
    stock: variant.stock,
    warning_stock: variant.warning_stock,
    weight: variant.weight,
    height: variant.height,
    width: variant.width,
    depth: variant.depth,
    options: variant.options,
    product: {
      title: product.title,
      categories: product.categories,
      related_products: product.related_products,
    },
  }
}

export function toInventoryForFormatDTO(row: CatalogSafeStock | null): InventoryForFormatDTO | null {
  if (!row) return null
  return {
    available_to_sell: row.available_to_sell,
    warning_level: row.warning_level,
  }
}

export function toReserveForFormatDTO(row: InventoryReserve | null): ReserveForFormatDTO | null {
  if (!row) return null
  return {
    fecha_reserva: row.fecha_reserva,
  }
}
