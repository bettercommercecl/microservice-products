/**
 * Logica pura de formateo de packs para products_packs.
 * Separada para facilitar testing unitario.
 */

export interface PackItemInput {
  product?: string
  quantity?: number
  is_variant?: boolean
  variant_id?: number
}

export interface PackInput {
  id: number
  items_packs?: PackItemInput[]
}

export interface InventoryEntry {
  product_id: number
  sku: string
  safety_stock: number
  available_to_sell: number
  variant_id: number
  bin_picking_number: string | null
}

export interface FormattedPackRecord {
  pack_id: number
  product_id: number
  sku: string
  stock: number
  quantity: number | null
  is_variant: boolean
  variant_id: number | null
  serial: string | null
  reserve: string | null
}

/**
 * Formatea packs con items usando mapas de inventario y reserve.
 * variant_id siempre es el de la variante del componente (SKU hijo), desde inventario.
 */
export function formatPacksRecords(
  packs: PackInput[],
  inventoryMap: Map<string, InventoryEntry>,
  variantReserveMap: Map<string, string | null>
): FormattedPackRecord[] {
  const formattedPacks: FormattedPackRecord[] = []

  for (const pack of packs) {
    const packId = pack.id

    for (const item of pack.items_packs ?? []) {
      if (!item?.product || typeof item.product !== 'string') {
        continue
      }

      const sku = item.product.trim()
      const inventoryProduct = inventoryMap.get(sku)

      if (!inventoryProduct?.product_id || !inventoryProduct?.sku) {
        continue
      }

      const stockSecurity = inventoryProduct.safety_stock || 0
      const reserveFromVariant = variantReserveMap.get(sku) ?? null

      const variantId = inventoryProduct.variant_id ?? null
      const isVariant = item?.is_variant ?? false

      formattedPacks.push({
        pack_id: packId,
        product_id: inventoryProduct.product_id,
        sku: inventoryProduct.sku.trim(),
        stock:
          (item.quantity ?? 0) <= inventoryProduct.available_to_sell &&
          stockSecurity < inventoryProduct.available_to_sell
            ? inventoryProduct.available_to_sell
            : 0,
        quantity: item?.quantity ?? null,
        is_variant: isVariant,
        variant_id: variantId,
        serial: inventoryProduct.bin_picking_number ?? null,
        reserve: reserveFromVariant,
      })
    }
  }

  return formattedPacks
}
