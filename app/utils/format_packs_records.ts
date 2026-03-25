/**
 * Logica pura de formateo de packs para products_packs.
 * Separada para facilitar testing unitario.
 */

export interface PackItemInput {
  product?: string
  quantity?: number
  is_variant?: boolean
  variant_id?: number
  /** variants.id del producto pack (variants.product_id = pack_id); linea exacta para BC */
  pack_variant_id?: number
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
  /** Posicion 0-based de la linea dentro del pack (metafield). Identidad logica junto a pack_id. */
  line_index: number
  pack_id: number
  product_id: number
  sku: string
  stock: number
  quantity: number | null
  is_variant: boolean
  variant_id: number | null
  /** Variante del pack en BC: variants.id con product_id = pack_id */
  pack_variant_id: number | null
  serial: string | null
  reserve: string | null
}

/**
 * Formatea packs con items usando mapas de inventario y reserve.
 * variant_id: variante del componente (hijo), desde inventario.
 * pack_variant_id: variante del producto pack en BC (para UPDATE variants del pack).
 * line_index: orden denso de lineas persistidas por pack (permite mismo variant_id repetido).
 */
export function formatPacksRecords(
  packs: PackInput[],
  inventoryMap: Map<string, InventoryEntry>,
  variantReserveMap: Map<string, string | null>
): FormattedPackRecord[] {
  const formattedPacks: FormattedPackRecord[] = []

  for (const pack of packs) {
    const packId = pack.id
    let lineIndex = 0

    for (const item of pack.items_packs ?? []) {
      if (!item?.product || typeof item.product !== 'string') {
        continue
      }

      const sku = item.product.trim()
      const inventoryProduct = inventoryMap.get(sku)

      if (!inventoryProduct?.product_id || !inventoryProduct?.sku) {
        continue
      }

      const reserveFromVariant = variantReserveMap.get(sku) ?? null

      const variantId = inventoryProduct.variant_id ?? null
      const isVariant = item?.is_variant ?? false
      const qty = item.quantity ?? 0
      const avail = inventoryProduct.available_to_sell
      const rowStock = avail <= 0 || qty > avail ? 0 : avail
      const packVariantId =
        item.pack_variant_id !== undefined && item.pack_variant_id !== null
          ? item.pack_variant_id
          : null

      formattedPacks.push({
        line_index: lineIndex,
        pack_id: packId,
        product_id: inventoryProduct.product_id,
        sku: inventoryProduct.sku.trim(),
        stock: rowStock,
        quantity: item?.quantity ?? null,
        is_variant: isVariant,
        variant_id: variantId,
        pack_variant_id: packVariantId,
        serial: inventoryProduct.bin_picking_number ?? null,
        reserve: reserveFromVariant,
      })
      lineIndex += 1
    }
  }

  return formattedPacks
}
