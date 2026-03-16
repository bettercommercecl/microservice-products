import type { SizesConfig } from '#application/dto/sizes_config.dto'

export type StoreSizes = Record<string, { small: boolean; medium: boolean; big: boolean }>

function storeEntry(
  categories: number[],
  ids: { small: number | null; medium: number | null; big: number | null }
): { small: boolean; medium: boolean; big: boolean } {
  return {
    small: ids.small !== null && categories.includes(ids.small),
    medium: ids.medium !== null && categories.includes(ids.medium),
    big: ids.big !== null && categories.includes(ids.big),
  }
}

/**
 * Devuelve el objeto sizes por tienda segun categorias del producto.
 * Usa config inyectada (sin depender de env); el caller construye la config desde env.
 */
export function getSizesByProduct(
  categories: number[],
  config: SizesConfig
): StoreSizes {
  const result: StoreSizes = {}
  for (const [storeName, ids] of Object.entries(config.stores)) {
    result[storeName] = storeEntry(categories, ids)
  }
  return result
}
