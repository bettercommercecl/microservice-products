/**
 * Configuracion de sizes por tienda (small/medium/big) para el formatter.
 */
export interface StoreSizeIds {
  small: number | null
  medium: number | null
  big: number | null
}

export interface SizesConfig {
  countryCode: string
  stores: Record<string, StoreSizeIds>
}
