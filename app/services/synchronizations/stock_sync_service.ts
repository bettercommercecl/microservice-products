import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import CatalogSafeStock from '#models/catalog_safe_stock'
import Product from '#models/product'
import ProductPack from '#models/product_pack'
import Variant from '#models/variant'
import Logger from '@adonisjs/core/services/logger'
import Database from '@adonisjs/lucid/services/db'
import env from '#start/env'
import type { SafeStockItem } from '#interfaces/inventory_interface'

interface FormattedInventoryItem {
  sku: string
  variant_id: number
  product_id: number
  safety_stock: number
  warning_level: number
  available_to_sell: number
  bin_picking_number: string
}

export interface StockSyncReport {
  catalog_safe_stocks: { actualizados: number }
  variants_propagados: { actualizados: number }
  products_propagados: { actualizados: number }
  products_packs_propagados: { actualizados: number }
  resumen: { total_items_bc: number }
}

/**
 * Sincroniza stock desde BigCommerce: obtiene inventario principal y reserva (por pais),
 * actualiza catalog_safe_stocks y propaga available_to_sell/bin_picking_number a variants,
 * products y products_packs.
 */
export default class StockSyncService {
  private readonly BATCH_SIZE = 50
  private readonly MAX_RETRIES = 3
  private readonly BASE_BACKOFF_MS = 2000
  private readonly MAX_SYNC_MS = 10 * 60 * 1000

  constructor(private readonly bigcommerceService: BigCommerceService) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private async withRetries<T>(fn: () => Promise<T>, ctx: string): Promise<T> {
    let attempt = 0
    let backoff = this.BASE_BACKOFF_MS
    while (attempt < this.MAX_RETRIES) {
      try {
        return await fn()
      } catch (error: any) {
        attempt += 1
        const is429 =
          error?.response?.status === 429 ||
          error?.message?.includes('429') ||
          error?.message?.includes('rate limit')
        if (!is429 || attempt >= this.MAX_RETRIES) throw error
        Logger.warn(
          `Rate limit en ${ctx}. Reintento ${attempt}/${this.MAX_RETRIES} en ${backoff}ms`
        )
        await this.sleep(backoff)
        backoff = Math.min(backoff * 2, 15000)
      }
    }
    throw new Error(`Reintentos agotados en ${ctx}`)
  }

  private shouldAbort(deadline: number): void {
    if (Date.now() > deadline) {
      throw new Error('Sincronizacion de stock abortada por timeout global')
    }
  }

  /**
   * Ubicacion principal segun pais: INVENTORY_LOCATION_ID_CL, _CO, _PE.
   */
  private getMainLocationId(): string {
    const country = env.get('COUNTRY_CODE')
    return env.get(`INVENTORY_LOCATION_ID_${country}` as any) ?? ''
  }

  /**
   * Ubicacion reserva: INVENTORY_RESERVE_ID_{COUNTRY}
   */
  private getReserveLocationId(): string | null {
    const country = env.get('COUNTRY_CODE')
    return env.get(`INVENTORY_RESERVE_ID_${country}` as any) ?? null
  }

  private formatItem(item: SafeStockItem): FormattedInventoryItem {
    return {
      sku: item.identity.sku?.trim() ?? '',
      variant_id: item.identity.variant_id,
      product_id: item.identity.product_id,
      safety_stock: item.settings?.safety_stock ?? 0,
      warning_level: item.settings?.warning_level ?? 0,
      available_to_sell: item.available_to_sell ?? 0,
      bin_picking_number: String(item.settings?.bin_picking_number ?? '').trim(),
    }
  }

  /**
   * Fusiona inventario principal con reserva.
   * available_to_sell y safety_stock del principal; bin_picking_number de reserva si existe.
   */
  private mergeInventories(
    main: FormattedInventoryItem[],
    reserve: FormattedInventoryItem[]
  ): FormattedInventoryItem[] {
    const byVariantId = new Map<number, FormattedInventoryItem>()
    for (const m of main) {
      byVariantId.set(m.variant_id, { ...m, bin_picking_number: '' })
    }
    for (const r of reserve) {
      const existing = byVariantId.get(r.variant_id)
      if (existing) {
        existing.bin_picking_number = r.bin_picking_number || existing.bin_picking_number
      } else {
        byVariantId.set(r.variant_id, { ...r })
      }
    }
    return Array.from(byVariantId.values())
  }

  async syncStock(): Promise<StockSyncReport> {
    const mainLocationId = this.getMainLocationId()
    if (!mainLocationId) {
      Logger.warn(
        `INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')} no configurado, sync de stock omitida`
      )
      return this.emptyReport()
    }

    const deadline = Date.now() + this.MAX_SYNC_MS

    try {
      this.shouldAbort(deadline)

      const mainInventory: any = await this.withRetries(
        () => this.bigcommerceService.getInventoryGlobalReserve(mainLocationId),
        'inventario principal'
      )

      if (!Array.isArray(mainInventory)) {
        if (mainInventory?.status === 'Error') {
          Logger.error('Error obteniendo inventario principal', mainInventory)
          throw new Error(mainInventory.message ?? 'Error BigCommerce inventario principal')
        }
        throw new Error('Respuesta invalida de BigCommerce para inventario principal')
      }

      const mainFormatted = mainInventory.map((i: SafeStockItem) => this.formatItem(i))

      let merged: FormattedInventoryItem[] = mainFormatted
      const reserveLocationId = this.getReserveLocationId()
      if (reserveLocationId) {
        this.shouldAbort(deadline)
        const reserveInventory: any = await this.withRetries(
          () => this.bigcommerceService.getInventoryGlobalReserve(reserveLocationId),
          'inventario reserva'
        )
        if (Array.isArray(reserveInventory)) {
          const reserveFormatted = reserveInventory.map((i: SafeStockItem) => this.formatItem(i))
          merged = this.mergeInventories(mainFormatted, reserveFormatted)
        }
      }

      this.shouldAbort(deadline)

      const uniqueByVariantId = merged.reduce(
        (acc, cur) => {
          acc[cur.variant_id] = cur
          return acc
        },
        {} as Record<number, FormattedInventoryItem>
      )
      const toUpsert = Object.values(uniqueByVariantId)

      await CatalogSafeStock.updateOrCreateMany('variant_id', toUpsert)

      const { variantsUpdated, productsUpdated, packsUpdated } =
        await this.propagateToVariantsAndPacks(toUpsert, deadline)

      return {
        catalog_safe_stocks: { actualizados: toUpsert.length },
        variants_propagados: { actualizados: variantsUpdated },
        products_propagados: { actualizados: productsUpdated },
        products_packs_propagados: { actualizados: packsUpdated },
        resumen: { total_items_bc: mainInventory.length },
      }
    } catch (error: any) {
      Logger.error({ err: error }, 'Error en sincronizacion de stock')
      throw error
    }
  }

  private emptyReport(): StockSyncReport {
    return {
      catalog_safe_stocks: { actualizados: 0 },
      variants_propagados: { actualizados: 0 },
      products_propagados: { actualizados: 0 },
      products_packs_propagados: { actualizados: 0 },
      resumen: { total_items_bc: 0 },
    }
  }

  private async processInBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    deadline: number
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = []
    for (let i = 0; i < items.length; i += this.BATCH_SIZE) {
      this.shouldAbort(deadline)
      const batch = items.slice(i, i + this.BATCH_SIZE)
      const batchResults = await Promise.allSettled(batch.map(processor))
      results.push(...batchResults)
      if (i + this.BATCH_SIZE < items.length) await this.sleep(50)
    }
    return results
  }

  /**
   * Propaga cambios de catalog_safe_stocks a variants, products y products_packs.
   * - variants: stock = available_to_sell, warning_stock = safety_stock (por variant_id)
   * - products: stock y warning_stock desde suma real en tabla variants (GROUP BY product_id)
   * - products_packs: stock = available_to_sell, serial = bin_picking_number (por sku)
   */
  private async propagateToVariantsAndPacks(
    items: FormattedInventoryItem[],
    deadline: number
  ): Promise<{
    variantsUpdated: number
    productsUpdated: number
    packsUpdated: number
  }> {
    if (!items.length) return { variantsUpdated: 0, productsUpdated: 0, packsUpdated: 0 }

    const variantIds = items.map((i) => i.variant_id)
    const skus = [...new Set(items.map((i) => i.sku))]
    const productIds = [...new Set(items.map((i) => i.product_id))]
    const byVariantId = new Map(items.map((i) => [i.variant_id, i]))
    const bySku = new Map(items.map((i) => [i.sku, i]))

    const variantsToUpdate = await Variant.query()
      .whereIn('id', variantIds)
      .select('id', 'stock', 'warning_stock')
    const variantUpdates = variantsToUpdate.filter((v) => {
      const data = byVariantId.get(v.id)
      return data && (v.stock !== data.available_to_sell || v.warning_stock !== data.safety_stock)
    })

    const variantResults = await this.processInBatches(
      variantUpdates,
      async (v) => {
        const data = byVariantId.get(v.id)!
        await Variant.query().where('id', v.id).update({
          stock: data.available_to_sell,
          warning_stock: data.safety_stock,
        })
      },
      deadline
    )
    const variantsUpdated = variantResults.filter((r) => r.status === 'fulfilled').length

    this.shouldAbort(deadline)

    const aggregatedFromVariants = await Database.from('variants')
      .select('product_id')
      .sum({ stock: 'stock' })
      .sum({ warning_stock: 'warning_stock' })
      .whereIn('product_id', productIds)
      .groupBy('product_id')

    const aggMap = new Map<number, { stock: number; warning_stock: number }>()
    for (const row of aggregatedFromVariants) {
      aggMap.set(row.product_id, {
        stock: Number(row.stock ?? 0),
        warning_stock: Number(row.warning_stock ?? 0),
      })
    }

    const productsToUpdate = await Product.query()
      .whereIn('id', productIds)
      .select('id', 'stock', 'warning_stock')
    const productUpdates = productsToUpdate.filter((p) => {
      const agg = aggMap.get(p.id)
      return agg && (p.stock !== agg.stock || p.warning_stock !== agg.warning_stock)
    })

    const productResults = await this.processInBatches(
      productUpdates,
      async (p) => {
        const agg = aggMap.get(p.id)!
        await Product.query().where('id', p.id).update({
          stock: agg.stock,
          warning_stock: agg.warning_stock,
        })
      },
      deadline
    )
    const productsUpdated = productResults.filter((r) => r.status === 'fulfilled').length

    this.shouldAbort(deadline)

    const packsToUpdate = await ProductPack.query()
      .whereIn('sku', skus)
      .select('id', 'sku', 'stock', 'serial')
    const packUpdates = packsToUpdate.filter((p) => {
      const data = bySku.get(p.sku)
      if (!data) return false
      return (
        p.stock !== data.available_to_sell || (p.serial ?? '') !== (data.bin_picking_number || '')
      )
    })

    const packResults = await this.processInBatches(
      packUpdates,
      async (p) => {
        const data = bySku.get(p.sku)!
        await ProductPack.query()
          .where('id', p.id)
          .update({
            stock: data.available_to_sell,
            serial: data.bin_picking_number || null,
          })
      },
      deadline
    )
    const packsUpdated = packResults.filter((r) => r.status === 'fulfilled').length

    return { variantsUpdated, productsUpdated, packsUpdated }
  }
}
