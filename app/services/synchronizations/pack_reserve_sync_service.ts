import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import CatalogSafeStock from '#models/catalog_safe_stock'
import CategoryProduct from '#models/category_product'
import Product from '#models/product'
import ProductPack from '#models/product_pack'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import Database from '@adonisjs/lucid/services/db'

interface GroupedPackProduct {
  product_id: number
  sku: string
  stock: number
  quantity: number
  variant_id: number
  /** variants.id del producto pack (linea); para escribir reserve en la variante correcta */
  pack_variant_id: number | null
  serial: string | null
  reserve: string | null
}

interface GroupedPackData {
  table_id: number
  pack_id: number
  variant_id: number
  is_variant: boolean
  reserve: string | null
  serial: string | null
  products: GroupedPackProduct[]
}

interface PackItemInput {
  table_id: number
  pack_id: number
  product_id: number
  sku: string
  stock: number
  quantity: number
  is_variant: boolean
  variant_id: number
  pack_variant_id: number | null
  serial: string | null
  reserve: string | null
}

export interface PackReserveSyncReport {
  paso5_variants: { actualizados: number; fallidos: number }
  paso6_products: { actualizados: number; fallidos: number }
  paso6_categoryProducts: { agregadas: number; eliminadas: number; fallidas: number }
  paso7_catalogSafeStock: { actualizados: number; fallidos: number }
  paso8_inventoryReserve: { actualizados: number; saltados: number }
  paso9_inventoryBigCommerce: { exitosas: number; fallidas: number }
  paso10_productsBigCommerce: { exitosos: number; fallidos: number }
  resumen: {
    total_grupos_procesados: number
    total_productos_en_packs: number
    total_packs_con_productos: number
    total_registros_products_packs: number
  }
}

/**
 * Sincroniza packs con reserva: actualiza variants, categorias, catalog_safe_stock,
 * inventario en BigCommerce.
 */
export default class PackReserveSyncService {
  private readonly BATCH_SIZE = 15
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
      throw new Error('Sincronizacion de packs con reserva abortada por timeout global')
    }
  }

  private async processInBatches<T, R>(
    items: T[],
    processor: (item: T) => Promise<R>,
    batchSize = this.BATCH_SIZE
  ): Promise<PromiseSettledResult<R>[]> {
    const results: PromiseSettledResult<R>[] = []
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      const batchResults = await Promise.allSettled(batch.map(processor))
      results.push(...batchResults)
      if (i + batchSize < items.length) {
        await this.sleep(50)
      }
    }
    return results
  }

  async syncPacksReserve(): Promise<PackReserveSyncReport> {
    const packsCategoryId = env.get('ID_PACKS')
    const reserveCategoryId = env.get('ID_RESERVE')

    if (!packsCategoryId || !reserveCategoryId) {
      Logger.warn('ID_PACKS o ID_RESERVE no configurado. Sync packs reserve omitida.')
      return this.buildEmptyReport()
    }

    const deadline = Date.now() + this.MAX_SYNC_MS

    try {
      const productsInPacks = await this.getProductsInPacksCategory(packsCategoryId)
      const packIds = await this.getPackIdsFromProductsPacks(productsInPacks)
      const productsPacksData = await this.getProductsPacksDataByPackIds(packIds)
      const lineGroups = this.groupPackDataByPackLine(productsPacksData)
      const variantMerged = this.mergeGroupsForVariantScopedOperations(lineGroups)
      const packCategoryGroups = this.mergeGroupsByPackForCategories(lineGroups)

      const variantsUpdateResult = await this.updateVariantsFromGroupedData(variantMerged)
      const packVariantReserveResult =
        await this.updatePackVariantReserveFromPackLines(productsPacksData)

      const catalogSafeStockResult = await this.updateCatalogSafeStock(variantMerged)
      const catalogSafeStockPackParentsResult = await this.updateCatalogSafeStockPackParents(
        packCategoryGroups,
        productsPacksData
      )
      const inventoryReserveResult = await this.updateInventoryReserve(variantMerged)

      const formattedInventoryData = await this.formatDataForBigCommerceInventory(
        variantMerged,
        productsPacksData
      )
      const countryCode = env.get('COUNTRY_CODE')
      const inventoryLocationId =
        (env.get(`INVENTORY_LOCATION_ID_${countryCode}` as any) as string) ?? ''
      const inventoryReservePeId = env.get('INVENTORY_RESERVE_ID_PE') ?? ''
      const inventoryReserveCoId = env.get('INVENTORY_RESERVE_ID_CO') ?? ''

      const inventoryUpdatePromises: Promise<void>[] = []

      if (countryCode === 'PE') {
        if (formattedInventoryData.length > 0) {
          inventoryUpdatePromises.push(
            this.updateInventoryLocationPack(formattedInventoryData, inventoryLocationId, deadline)
          )
          inventoryUpdatePromises.push(
            this.updateInventoryLocationPack(formattedInventoryData, inventoryReservePeId, deadline)
          )
        }
      } else if (countryCode === 'CO') {
        const colombiaSpecialItems = formattedInventoryData.filter(
          (item) => item.settings?.[0]?.bin_picking_number === 'N22LK-LJJ2025-COL'
        )
        const colombiaRegularItems = formattedInventoryData.filter(
          (item) => item.settings?.[0]?.bin_picking_number !== 'N22LK-LJJ2025-COL'
        )
        if (colombiaSpecialItems.length > 0) {
          inventoryUpdatePromises.push(
            this.updateInventoryLocationPack(colombiaSpecialItems, '6', deadline)
          )
        }
        if (colombiaRegularItems.length > 0) {
          inventoryUpdatePromises.push(
            this.updateInventoryLocationPack(colombiaRegularItems, inventoryLocationId, deadline)
          )
          inventoryUpdatePromises.push(
            this.updateInventoryLocationPack(colombiaRegularItems, inventoryReserveCoId, deadline)
          )
        }
      } else if (formattedInventoryData.length > 0 && inventoryLocationId) {
        inventoryUpdatePromises.push(
          this.updateInventoryLocationPack(formattedInventoryData, inventoryLocationId, deadline)
        )
      }

      const inventoryUpdateResults = await Promise.allSettled(inventoryUpdatePromises)
      const successfulInventoryUpdates = inventoryUpdateResults.filter(
        (r) => r.status === 'fulfilled'
      ).length
      const failedInventoryUpdates = inventoryUpdateResults.filter(
        (r) => r.status === 'rejected'
      ).length

      const productUpdateResults = await this.updateBigCommerceProducts(
        packCategoryGroups,
        Number(reserveCategoryId),
        deadline
      )

      // Tras asignar/quitar categoria reserva en BC: reflejar en `products` y `category_products`
      const [productsUpdateResult, categoryProductsResult] = await Promise.allSettled([
        this.updateProductsCategories(packCategoryGroups, Number(reserveCategoryId)),
        this.updateCategoryProducts(packCategoryGroups, Number(reserveCategoryId)),
      ])

      const productsData =
        productsUpdateResult.status === 'fulfilled'
          ? productsUpdateResult.value
          : { updated: 0, failed: 0 }
      const categoryProductsData =
        categoryProductsResult.status === 'fulfilled'
          ? categoryProductsResult.value
          : { added: 0, removed: 0, failed: 0 }

      return {
        paso5_variants: {
          actualizados: variantsUpdateResult.updated + packVariantReserveResult.updated,
          fallidos: variantsUpdateResult.failed + packVariantReserveResult.failed,
        },
        paso6_products: {
          actualizados: productsData.updated,
          fallidos: productsData.failed,
        },
        paso6_categoryProducts: {
          agregadas: categoryProductsData.added,
          eliminadas: categoryProductsData.removed,
          fallidas: categoryProductsData.failed,
        },
        paso7_catalogSafeStock: {
          actualizados: catalogSafeStockResult.updated + catalogSafeStockPackParentsResult.updated,
          fallidos: catalogSafeStockResult.failed + catalogSafeStockPackParentsResult.failed,
        },
        paso8_inventoryReserve: {
          actualizados: inventoryReserveResult.updated,
          saltados: inventoryReserveResult.skipped,
        },
        paso9_inventoryBigCommerce: {
          exitosas: successfulInventoryUpdates,
          fallidas: failedInventoryUpdates,
        },
        paso10_productsBigCommerce: {
          exitosos: productUpdateResults.updateds,
          fallidos: productUpdateResults.faileds,
        },
        resumen: {
          total_grupos_procesados: variantMerged.length,
          total_productos_en_packs: productsInPacks.length,
          total_packs_con_productos: packIds.length,
          total_registros_products_packs: productsPacksData.length,
        },
      }
    } catch (error: any) {
      Logger.error({ error: error.message }, 'Error en la sincronizacion de packs con reserva')
      throw error
    }
  }

  private buildEmptyReport(): PackReserveSyncReport {
    return {
      paso5_variants: { actualizados: 0, fallidos: 0 },
      paso6_products: { actualizados: 0, fallidos: 0 },
      paso6_categoryProducts: { agregadas: 0, eliminadas: 0, fallidas: 0 },
      paso7_catalogSafeStock: { actualizados: 0, fallidos: 0 },
      paso8_inventoryReserve: { actualizados: 0, saltados: 0 },
      paso9_inventoryBigCommerce: { exitosas: 0, fallidas: 0 },
      paso10_productsBigCommerce: { exitosos: 0, fallidos: 0 },
      resumen: {
        total_grupos_procesados: 0,
        total_productos_en_packs: 0,
        total_packs_con_productos: 0,
        total_registros_products_packs: 0,
      },
    }
  }

  async getProductsInPacksCategory(packsCategoryId: number): Promise<number[]> {
    const rows = await Database.from('category_products')
      .select('product_id')
      .where('category_id', packsCategoryId)
    return rows.map((r: { product_id: number }) => r.product_id)
  }

  async getPackIdsFromProductsPacks(productIds: number[]): Promise<number[]> {
    if (!productIds.length) return []
    const rows = await Database.from('products_packs')
      .select('pack_id')
      .whereIn('pack_id', productIds)
    return [...new Set(rows.map((r: { pack_id: number }) => r.pack_id))]
  }

  async getProductsPacksDataByPackIds(packIds: number[]): Promise<PackItemInput[]> {
    if (!packIds.length) return []
    const rows = await ProductPack.query().whereIn('pack_id', packIds)
    return rows.map((item) => ({
      table_id: item.id,
      pack_id: item.pack_id,
      product_id: item.product_id,
      sku: item.sku,
      stock: item.stock,
      quantity: item.quantity ?? 0,
      is_variant: item.is_variant,
      variant_id: item.variant_id ?? 0,
      pack_variant_id: item.pack_variant_id ?? null,
      serial: item.serial,
      reserve: item.reserve,
    }))
  }

  /**
   * Una fila de products_packs = una línea del pack; table_id (id de la fila) es la identidad estable.
   * (pack_id, variant_id) no basta si la misma variante aparece en varias líneas con cantidades distintas.
   */
  groupPackDataByPackLine(packItems: PackItemInput[]): GroupedPackData[] {
    if (!packItems.length) return []

    return packItems.map((item) => {
      const productEntry: GroupedPackProduct = {
        product_id: item.product_id,
        sku: item.sku,
        stock: item.stock,
        quantity: item.quantity,
        variant_id: item.variant_id,
        pack_variant_id: item.pack_variant_id,
        serial: item.serial,
        reserve: item.reserve,
      }
      const group: GroupedPackData = {
        table_id: item.table_id,
        pack_id: item.pack_id,
        variant_id: item.variant_id,
        is_variant: item.is_variant,
        reserve: null,
        serial: null,
        products: [productEntry],
      }
      const { reserve, serial } = this.computeReserveSerialFromProducts(group.products)
      group.reserve = reserve
      group.serial = serial
      return group
    })
  }

  private computeReserveSerialFromProducts(products: GroupedPackProduct[]): {
    reserve: string | null
    serial: string | null
  } {
    const productsWithReserve = products.filter((p) => p.reserve && p.reserve.trim() !== '')
    if (productsWithReserve.length > 0) {
      const farthest = productsWithReserve.reduce((a, b) =>
        new Date(b.reserve!) > new Date(a.reserve!) ? b : a
      )
      return {
        reserve: farthest.reserve ?? null,
        serial: farthest.serial?.trim() || null,
      }
    }
    const withSerial = products.filter((p) => p.serial && p.serial.trim() !== '')
    if (withSerial.length > 0) {
      return { reserve: null, serial: withSerial[0].serial?.trim() || null }
    }
    return { reserve: null, serial: null }
  }

  /**
   * Categoria reserva del producto pack (pack_id): basta con que alguna linea hijo tenga serial.
   */
  private packGroupHasAnySerial(group: GroupedPackData): boolean {
    return group.products.some((p) => String(p.serial ?? '').trim() !== '')
  }

  /**
   * Asigna `variants.reserve` donde `variants.id` = `pack_variant_id` de la linea en products_packs.
   * Varias lineas con el mismo pack_variant_id: se usa la fecha mas lejana.
   */
  private async updatePackVariantReserveFromPackLines(
    items: PackItemInput[]
  ): Promise<{ updated: number; failed: number }> {
    const byVariant = new Map<number, string[]>()
    for (const item of items) {
      const pv = item.pack_variant_id
      if (pv === null || pv === undefined || pv === 0) continue
      const r = item.reserve?.trim()
      if (!r) continue
      const list = byVariant.get(pv) ?? []
      list.push(r)
      byVariant.set(pv, list)
    }
    if (byVariant.size === 0) return { updated: 0, failed: 0 }

    const targets = Array.from(byVariant.entries()).map(([variantId, dates]) => ({
      variantId,
      reserve: dates.reduce((a, b) => (new Date(b) > new Date(a) ? b : a)),
    }))

    const results = await this.processInBatches(targets, async ({ variantId, reserve }) => {
      try {
        const affected = await Database.from('variants')
          .where('id', variantId)
          .update({ reserve, updated_at: new Date() })
        const n = typeof affected === 'number' ? affected : 0
        if (n === 0) {
          Logger.warn({ variantId }, 'Sin fila variants para pack_variant_id al asignar reserve')
          return { success: false, type: 'not_found' }
        }
        return { success: true, type: 'updated' }
      } catch (error: any) {
        Logger.error({ err: error, variantId }, 'Error actualizando reserve en variante del pack')
        return { success: false, type: 'error' }
      }
    })

    const resolved = results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false }))
    return {
      updated: resolved.filter((x) => x.success && (x as any).type === 'updated').length,
      failed: resolved.filter((x) => !x.success).length,
    }
  }

  /**
   * BigCommerce y variants tienen un solo registro por variant_id: combina líneas que comparten pack + variante hijo
   * para stock insuficiente, reserva y catalog_safe_stock sin perder ninguna cantidad en el some().
   */
  private mergeGroupsForVariantScopedOperations(lineGroups: GroupedPackData[]): GroupedPackData[] {
    if (!lineGroups.length) return []

    const map = new Map<string, GroupedPackData>()
    for (const line of lineGroups) {
      const key =
        line.variant_id && line.variant_id !== 0
          ? `${line.pack_id}-${line.variant_id}`
          : `simple-${line.pack_id}`

      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          table_id: line.table_id,
          pack_id: line.pack_id,
          variant_id: line.variant_id,
          is_variant: line.is_variant,
          reserve: null,
          serial: null,
          products: [...line.products],
        })
      } else {
        existing.products.push(...line.products)
      }
    }

    return Array.from(map.values()).map((group) => {
      const { reserve, serial } = this.computeReserveSerialFromProducts(group.products)
      group.reserve = reserve
      group.serial = serial
      return group
    })
  }

  /**
   * Categorías de reserva van al producto pack: una decisión por pack_id usando todas las líneas (serial / reserva).
   */
  private mergeGroupsByPackForCategories(lineGroups: GroupedPackData[]): GroupedPackData[] {
    if (!lineGroups.length) return []

    const map = new Map<number, GroupedPackData>()
    for (const line of lineGroups) {
      const existing = map.get(line.pack_id)
      if (!existing) {
        map.set(line.pack_id, {
          table_id: line.table_id,
          pack_id: line.pack_id,
          variant_id: 0,
          is_variant: false,
          reserve: null,
          serial: null,
          products: [...line.products],
        })
      } else {
        existing.products.push(...line.products)
      }
    }

    return Array.from(map.values()).map((group) => {
      const { reserve, serial } = this.computeReserveSerialFromProducts(group.products)
      group.reserve = reserve
      group.serial = serial
      return group
    })
  }

  async updateVariantsFromGroupedData(
    groupedPackData: GroupedPackData[]
  ): Promise<{ updated: number; failed: number }> {
    if (!groupedPackData.length) return { updated: 0, failed: 0 }

    const results = await this.processInBatches(groupedPackData, async (group) => {
      const hasInsufficientStock = group.products.some((p) => p.stock === 0 || p.stock < p.quantity)

      const variantIdToUse = group.variant_id && group.variant_id !== 0 ? group.variant_id : null

      if (variantIdToUse !== null) {
        const variant = await Database.from('variants')
          .select('id', 'product_id', 'stock', 'reserve')
          .where('id', variantIdToUse)
          .first()
        if (!variant) {
          Logger.warn(`No variant para variant_id ${variantIdToUse}`)
          return { success: false, type: 'not_found' }
        }
        const updateData: Record<string, any> = {
          stock: hasInsufficientStock ? 0 : variant.stock,
          updated_at: new Date(),
        }
        if (!hasInsufficientStock && group.reserve) updateData.reserve = group.reserve
        await Database.from('variants').where('id', variant.id).update(updateData)
        return { success: true, type: 'updated' }
      }

      const variant = await Database.from('variants')
        .select('id', 'product_id', 'stock', 'reserve')
        .where('product_id', group.pack_id)
        .first()
      if (!variant) {
        Logger.warn(`No variant para pack_id ${group.pack_id} (pack simple sin variant_id)`)
        return { success: false, type: 'not_found' }
      }
      const updateData: Record<string, any> = {
        stock: hasInsufficientStock ? 0 : variant.stock,
        updated_at: new Date(),
      }
      if (!hasInsufficientStock && group.reserve) updateData.reserve = group.reserve
      await Database.from('variants').where('id', variant.id).update(updateData)
      return { success: true, type: 'updated' }
    })

    const resolved = results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false }))
    return {
      updated: resolved.filter((x) => x.success && (x as any).type === 'updated').length,
      failed: resolved.filter((x) => !x.success).length,
    }
  }

  async updateProductsCategories(
    groupedPackData: GroupedPackData[],
    reserveCategoryId: number
  ): Promise<{ updated: number; failed: number }> {
    if (!groupedPackData.length) return { updated: 0, failed: 0 }

    const results = await this.processInBatches(groupedPackData, async (group) => {
      const product = await Product.find(group.pack_id)
      if (!product) {
        Logger.warn(`No producto para pack_id ${group.pack_id}`)
        return { success: false, type: 'not_found' }
      }

      let currentCategories: number[] = []
      try {
        currentCategories = Array.isArray(product.categories)
          ? product.categories
          : typeof product.categories === 'string'
            ? JSON.parse(product.categories || '[]')
            : []
      } catch {
        currentCategories = []
      }

      const hasSerial = this.packGroupHasAnySerial(group)
      let newCategories: number[]
      if (hasSerial) {
        newCategories = currentCategories.includes(reserveCategoryId)
          ? currentCategories
          : [...currentCategories, reserveCategoryId]
      } else {
        newCategories = currentCategories.includes(reserveCategoryId)
          ? currentCategories.filter((c) => c !== reserveCategoryId)
          : currentCategories
      }

      if (JSON.stringify(newCategories.sort()) !== JSON.stringify([...currentCategories].sort())) {
        product.categories = newCategories
        await product.save()
        return { success: true, type: 'updated' }
      }
      return { success: true, type: 'no_changes' }
    })

    const resolved = results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false }))
    return {
      updated: resolved.filter((x) => x.success && (x as any).type === 'updated').length,
      failed: resolved.filter((x) => !x.success).length,
    }
  }

  async updateCategoryProducts(
    groupedPackData: GroupedPackData[],
    reserveCategoryId: number
  ): Promise<{ added: number; removed: number; failed: number }> {
    if (!groupedPackData.length) return { added: 0, removed: 0, failed: 0 }

    const packsWithSerial = groupedPackData.filter((g) => this.packGroupHasAnySerial(g))
    const packsWithoutSerial = groupedPackData.filter((g) => !this.packGroupHasAnySerial(g))

    let addedCount = 0
    let removedCount = 0
    let failedCount = 0

    if (packsWithSerial.length > 0) {
      const addResults = await this.processInBatches(packsWithSerial, async (group) => {
        const exists = await Product.find(group.pack_id)
        if (!exists) return { success: true, type: 'skipped' }
        const existing = await CategoryProduct.query()
          .where('category_id', reserveCategoryId)
          .where('product_id', group.pack_id)
          .first()
        if (existing) return { success: true, type: 'already_exists' }
        try {
          await CategoryProduct.updateOrCreate(
            { category_id: reserveCategoryId, product_id: group.pack_id },
            { category_id: reserveCategoryId, product_id: group.pack_id }
          )
          return { success: true, type: 'added' }
        } catch (error: any) {
          const msg = error?.message || ''
          if (
            msg.includes('duplicate') ||
            msg.includes('unique') ||
            error?.code === 23505 ||
            error?.code === '23505'
          ) {
            return { success: true, type: 'already_exists' }
          }
          Logger.error({ err: error, packId: group.pack_id }, 'Error agregando category_product')
          return { success: false, type: 'error' }
        }
      })
      addedCount = addResults.filter(
        (r) =>
          r.status === 'fulfilled' && (r.value as any).success && (r.value as any).type === 'added'
      ).length
      failedCount += addResults.filter(
        (r) => r.status === 'fulfilled' && !(r.value as any).success
      ).length
    }

    if (packsWithoutSerial.length > 0) {
      const packIdsToRemove = packsWithoutSerial.map((g) => g.pack_id)
      try {
        const deleted = await Database.from('category_products')
          .where('category_id', reserveCategoryId)
          .whereIn('product_id', packIdsToRemove)
          .delete()
        removedCount =
          typeof deleted === 'number' ? deleted : Array.isArray(deleted) ? deleted.length : 0
      } catch (error: any) {
        Logger.error({ err: error }, 'Error eliminando category_products')
        failedCount += 1
      }
    }

    return { added: addedCount, removed: removedCount, failed: failedCount }
  }

  async updateCatalogSafeStock(
    groupedPackData: GroupedPackData[]
  ): Promise<{ updated: number; failed: number }> {
    if (!groupedPackData.length) return { updated: 0, failed: 0 }

    const results = await this.processInBatches(groupedPackData, async (group) => {
      const binPickingNumber = group.serial?.trim() ?? ''
      let catalogRecord: any

      if (group.variant_id && group.variant_id !== 0) {
        catalogRecord = await CatalogSafeStock.query()
          .select('id', 'product_id', 'variant_id')
          .where('variant_id', group.variant_id)
          .first()
      } else {
        catalogRecord = await CatalogSafeStock.query()
          .select('id', 'product_id', 'variant_id')
          .where('product_id', group.pack_id)
          .first()
      }

      if (!catalogRecord) return { success: false, type: 'not_found' }
      catalogRecord.bin_picking_number = binPickingNumber
      await catalogRecord.save()
      return { success: true, type: 'updated' }
    })

    const resolved = results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false }))
    return {
      updated: resolved.filter((x) => x.success && (x as any).type === 'updated').length,
      failed: resolved.filter((x) => !x.success).length,
    }
  }

  /**
   * Variante padre del pack (`pack_variant_id`): si el pack entra o sale de reserva,
   * refleja el serial en `bin_picking_number` o lo limpia. Busca fila por `variant_id`.
   */
  async updateCatalogSafeStockPackParents(
    packCategoryGroups: GroupedPackData[],
    productsPacksData: PackItemInput[]
  ): Promise<{ updated: number; failed: number }> {
    const packIdToBin = new Map<number, string>()
    for (const g of packCategoryGroups) {
      const bin = this.packGroupHasAnySerial(g) ? (g.serial?.trim() ?? '') : ''
      packIdToBin.set(g.pack_id, bin)
    }

    const variantIds = new Set<number>()
    const variantToPackId = new Map<number, number>()
    for (const row of productsPacksData) {
      const pv = row.pack_variant_id
      if (pv === null || pv === undefined || pv === 0) continue
      variantIds.add(pv)
      variantToPackId.set(pv, row.pack_id)
    }

    const targets = [...variantIds]
    if (!targets.length) return { updated: 0, failed: 0 }

    const results = await this.processInBatches(targets, async (packVariantId) => {
      const packId = variantToPackId.get(packVariantId)
      if (packId === undefined) return { success: false, type: 'no_pack' }
      const binPickingNumber = packIdToBin.get(packId) ?? ''

      const catalogRecord = await CatalogSafeStock.query()
        .select('id', 'product_id', 'variant_id')
        .where('variant_id', packVariantId)
        .first()
      if (!catalogRecord) return { success: false, type: 'not_found' }
      catalogRecord.bin_picking_number = binPickingNumber
      await catalogRecord.save()
      return { success: true, type: 'updated' }
    })

    const resolved = results.map((r) => (r.status === 'fulfilled' ? r.value : { success: false }))
    return {
      updated: resolved.filter((x) => x.success && (x as any).type === 'updated').length,
      failed: resolved.filter((x) => !x.success).length,
    }
  }

  async updateInventoryReserve(
    _groupedPackData: GroupedPackData[]
  ): Promise<{ updated: number; skipped: number }> {
    const countryCode = env.get('COUNTRY_CODE')
    if (countryCode !== 'PE' && countryCode !== 'CO') {
      return { updated: 0, skipped: 0 }
    }
    const tableName = countryCode === 'PE' ? 'inventory_reserve_peru' : 'inventory_reserve_colombia'
    try {
      await Database.raw(`SELECT 1 FROM ${tableName} LIMIT 1`)
    } catch {
      Logger.warn(`Tabla ${tableName} no existe, omitiendo updateInventoryReserve`)
      return { updated: 0, skipped: _groupedPackData.length }
    }
    return { updated: 0, skipped: _groupedPackData.length }
  }

  async formatDataForBigCommerceInventory(
    groupedPackData: GroupedPackData[],
    productsPacksData: PackItemInput[]
  ): Promise<
    Array<{
      settings: Array<{
        identity?: { sku?: string }
        safety_stock?: number
        is_in_stock?: boolean
        warning_level?: number
        bin_picking_number?: string
      }>
    }>
  > {
    type InventoryPayloadItem = {
      settings: Array<{
        identity?: { sku?: string }
        safety_stock?: number
        is_in_stock?: boolean
        warning_level?: number
        bin_picking_number?: string
      }>
    }

    const childRows: InventoryPayloadItem[] = []
    if (groupedPackData.length > 0) {
      const variantIds = [
        ...new Set(
          groupedPackData.filter((g) => g.variant_id && g.variant_id !== 0).map((g) => g.variant_id)
        ),
      ]
      const packIds = [
        ...new Set(
          groupedPackData.filter((g) => !g.variant_id || g.variant_id === 0).map((g) => g.pack_id)
        ),
      ]

      const [byProduct, byVariant] = await Promise.all([
        packIds.length > 0
          ? Database.from('catalog_safe_stocks')
              .select('product_id', 'sku', 'safety_stock', 'warning_level', 'bin_picking_number')
              .whereIn('product_id', packIds)
          : [],
        variantIds.length > 0
          ? Database.from('catalog_safe_stocks')
              .select('variant_id', 'sku', 'safety_stock', 'warning_level', 'bin_picking_number')
              .whereIn('variant_id', variantIds)
          : [],
      ])

      const byProductMap = new Map<number, any>()
      const byVariantMap = new Map<number, any>()
      ;(byProduct as any[]).forEach((r) => byProductMap.set(r.product_id, r))
      ;(byVariant as any[]).forEach((r) => byVariantMap.set(r.variant_id, r))

      for (const group of groupedPackData) {
        const record =
          group.variant_id && group.variant_id !== 0
            ? byVariantMap.get(group.variant_id)
            : byProductMap.get(group.pack_id)
        if (!record) continue
        childRows.push({
          settings: [
            {
              identity: { sku: record.sku },
              safety_stock: record.safety_stock,
              is_in_stock: true,
              warning_level: record.warning_level,
              bin_picking_number: group.serial ?? '',
            },
          ],
        })
      }
    }

    const parentVariantIds = [
      ...new Set(
        productsPacksData
          .map((r) => r.pack_variant_id)
          .filter((id): id is number => typeof id === 'number' && id !== 0)
      ),
    ]

    let parentRows: InventoryPayloadItem[] = []
    if (parentVariantIds.length > 0) {
      const parentRecords = await Database.from('catalog_safe_stocks')
        .select('variant_id', 'sku', 'safety_stock', 'warning_level', 'bin_picking_number')
        .whereIn('variant_id', parentVariantIds)

      parentRows = (parentRecords as any[]).map((record) => ({
        settings: [
          {
            identity: { sku: record.sku },
            safety_stock: record.safety_stock,
            is_in_stock: true,
            warning_level: record.warning_level,
            bin_picking_number: String(record.bin_picking_number ?? '').trim(),
          },
        ],
      }))
    }

    return this.mergeInventoryPayloadBySkuLastWins([...childRows, ...parentRows])
  }

  /**
   * Misma SKU en hijo y padre: gana la ultima entrada (padre va despues del hijo).
   */
  private mergeInventoryPayloadBySkuLastWins(
    items: Array<{
      settings: Array<{
        identity?: { sku?: string }
        safety_stock?: number
        is_in_stock?: boolean
        warning_level?: number
        bin_picking_number?: string
      }>
    }>
  ): typeof items {
    const bySku = new Map<string, (typeof items)[number]>()
    let noSkuIdx = 0
    for (const item of items) {
      const sku = item.settings[0]?.identity?.sku
      if (sku && sku.trim() !== '') {
        bySku.set(sku, item)
      } else {
        bySku.set(`__empty_${noSkuIdx++}`, item)
      }
    }
    return [...bySku.values()]
  }

  /**
   * En BigCommerce solo se toca la categoria reserva: DELETE del par (pack, ID_RESERVE) si sale de reserva;
   * PUT de asignaciones solo con { product_id: pack_id, category_id: ID_RESERVE } si entra o sigue en reserva.
   * Despues de esto, syncPacksReserve actualiza `products.categories` y `category_products` para alinear BD local.
   */
  private async updateBigCommerceProducts(
    groupedPackData: GroupedPackData[],
    reserveCategoryId: number,
    deadline: number
  ): Promise<{ updateds: number; faileds: number }> {
    this.shouldAbort(deadline)
    const uniquePackIds = [...new Set(groupedPackData.map((g) => g.pack_id))]
    try {
      const packIdsToRemoveFromReserve = [
        ...new Set(
          groupedPackData.filter((g) => !this.packGroupHasAnySerial(g)).map((g) => g.pack_id)
        ),
      ]
      if (packIdsToRemoveFromReserve.length > 0) {
        await this.withRetries(
          () =>
            this.bigcommerceService.deleteCategoryAssignments(packIdsToRemoveFromReserve, [
              reserveCategoryId,
            ]),
          'delete category assignments (reserve)'
        )
      }

      const packIdsToAssignReserve = [
        ...new Set(
          groupedPackData.filter((g) => this.packGroupHasAnySerial(g)).map((g) => g.pack_id)
        ),
      ]
      if (packIdsToAssignReserve.length === 0) {
        return { updateds: 0, faileds: 0 }
      }

      const assignments = packIdsToAssignReserve.map((productId) => ({
        product_id: productId,
        category_id: reserveCategoryId,
      }))
      await this.withRetries(
        () => this.bigcommerceService.updateCategoryAssignments(assignments),
        'create category assignments (reserve only)'
      )
      return { updateds: packIdsToAssignReserve.length, faileds: 0 }
    } catch (error: any) {
      Logger.error({ err: error }, 'Error actualizando categorias en BigCommerce')
      return { updateds: 0, faileds: uniquePackIds.length }
    }
  }

  private async updateInventoryLocationPack(
    items: Array<{ settings: Array<Record<string, any>> }>,
    inventoryId: string,
    deadline: number
  ): Promise<void> {
    if (!inventoryId) return
    this.shouldAbort(deadline)
    const settings = items.flatMap((i) => i.settings)
    if (!settings.length) return
    await this.withRetries(
      () => this.bigcommerceService.updateInventoryLocationItems(inventoryId, settings),
      `update inventory location ${inventoryId}`
    )
  }
}
