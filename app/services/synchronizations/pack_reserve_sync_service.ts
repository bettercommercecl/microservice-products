import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import Product from '#models/product'
import ProductPack from '#models/product_pack'
import CategoryProduct from '#models/category_product'
import CatalogSafeStock from '#models/catalog_safe_stock'
import Logger from '@adonisjs/core/services/logger'
import Database from '@adonisjs/lucid/services/db'
import env from '#start/env'

interface GroupedPackProduct {
  product_id: number
  sku: string
  stock: number
  quantity: number
  variant_id: number
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
      const groupedPackData = this.groupPackDataByPackAndVariant(productsPacksData)

      const variantsUpdateResult = await this.updateVariantsFromGroupedData(groupedPackData)

      const [productsUpdateResult, categoryProductsResult] = await Promise.allSettled([
        this.updateProductsCategories(groupedPackData, Number(reserveCategoryId)),
        this.updateCategoryProducts(groupedPackData, Number(reserveCategoryId)),
      ])

      const productsData =
        productsUpdateResult.status === 'fulfilled'
          ? productsUpdateResult.value
          : { updated: 0, failed: 0 }
      const categoryProductsData =
        categoryProductsResult.status === 'fulfilled'
          ? categoryProductsResult.value
          : { added: 0, removed: 0, failed: 0 }

      const catalogSafeStockResult = await this.updateCatalogSafeStock(groupedPackData)
      const inventoryReserveResult = await this.updateInventoryReserve(groupedPackData)

      const formattedInventoryData = await this.formatDataForBigCommerceInventory(groupedPackData)
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

      const productDataForBigCommerce = await this.formatDataForBigCommerceProduct(groupedPackData)
      const productUpdateResults = await this.updateBigCommerceProducts(
        productDataForBigCommerce,
        groupedPackData,
        Number(reserveCategoryId),
        deadline
      )

      return {
        paso5_variants: {
          actualizados: variantsUpdateResult.updated,
          fallidos: variantsUpdateResult.failed,
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
          actualizados: catalogSafeStockResult.updated,
          fallidos: catalogSafeStockResult.failed,
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
          total_grupos_procesados: groupedPackData.length,
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
      serial: item.serial,
      reserve: item.reserve,
    }))
  }

  groupPackDataByPackAndVariant(packItems: PackItemInput[]): GroupedPackData[] {
    if (!packItems.length) return []

    const groupedMap = packItems.reduce((map, item) => {
      const groupKey = `${item.pack_id}-${item.variant_id}`
      const existing = map.get(groupKey)
      const productEntry = {
        product_id: item.product_id,
        sku: item.sku,
        stock: item.stock,
        quantity: item.quantity,
        variant_id: item.variant_id,
        serial: item.serial,
        reserve: item.reserve,
      }
      if (existing) {
        existing.products.push(productEntry)
      } else {
        map.set(groupKey, {
          table_id: item.table_id,
          pack_id: item.pack_id,
          variant_id: item.variant_id,
          is_variant: item.is_variant,
          reserve: null,
          serial: null,
          products: [productEntry],
        })
      }
      return map
    }, new Map<string, GroupedPackData>())

    return Array.from(groupedMap.values()).map((group) => {
      const productsWithReserve = group.products.filter((p) => p.reserve && p.reserve.trim() !== '')
      if (productsWithReserve.length > 0) {
        const farthest = productsWithReserve.reduce((a, b) =>
          new Date(b.reserve!) > new Date(a.reserve!) ? b : a
        )
        group.reserve = farthest.reserve
        group.serial = farthest.serial?.trim() || null
      } else {
        const withSerial = group.products.filter((p) => p.serial && p.serial.trim() !== '')
        if (withSerial.length > 0) {
          group.reserve = null
          group.serial = withSerial[0].serial?.trim() || null
        } else {
          group.reserve = null
          group.serial = null
        }
      }
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

      const hasSerial = !!(group.serial && group.serial.trim() !== '')
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

    const packsWithSerial = groupedPackData.filter((g) => g.serial && g.serial.trim() !== '')
    const packsWithoutSerial = groupedPackData.filter((g) => !g.serial || g.serial.trim() === '')

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

  async formatDataForBigCommerceProduct(
    groupedPackData: GroupedPackData[]
  ): Promise<{ id: number; categories: number[] }[]> {
    if (!groupedPackData.length) return []
    const uniquePackIds = [...new Set(groupedPackData.map((g) => g.pack_id))]
    const allCp = await Database.from('category_products')
      .select('product_id', 'category_id')
      .whereIn('product_id', uniquePackIds)
    const categoriesMap = new Map<number, number[]>()
    allCp.forEach((cp: { product_id: number; category_id: number }) => {
      if (!categoriesMap.has(cp.product_id)) categoriesMap.set(cp.product_id, [])
      categoriesMap.get(cp.product_id)!.push(cp.category_id)
    })
    return groupedPackData.map((g) => ({
      id: g.pack_id,
      categories: categoriesMap.get(g.pack_id) ?? [],
    }))
  }

  async formatDataForBigCommerceInventory(groupedPackData: GroupedPackData[]): Promise<
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
    if (!groupedPackData.length) return []
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

    return groupedPackData
      .map((group) => {
        const record =
          group.variant_id && group.variant_id !== 0
            ? byVariantMap.get(group.variant_id)
            : byProductMap.get(group.pack_id)
        if (!record) return null
        return {
          settings: [
            {
              identity: { sku: record.sku },
              safety_stock: record.safety_stock,
              is_in_stock: true,
              warning_level: record.warning_level,
              bin_picking_number: group.serial ?? '',
            },
          ],
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
  }

  private async updateBigCommerceProducts(
    productData: { id: number; categories: number[] }[],
    groupedPackData: GroupedPackData[],
    reserveCategoryId: number,
    deadline: number
  ): Promise<{ updateds: number; faileds: number }> {
    this.shouldAbort(deadline)
    try {
      const packIdsToRemoveFromReserve = [
        ...new Set(
          groupedPackData.filter((g) => !g.serial || g.serial.trim() === '').map((g) => g.pack_id)
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

      if (!productData.length) return { updateds: 0, faileds: 0 }
      const uniqueByProduct = new Map<number, number[]>()
      productData.forEach((p) => {
        const existing = uniqueByProduct.get(p.id) ?? []
        const merged = [...new Set([...existing, ...p.categories])]
        uniqueByProduct.set(p.id, merged)
      })
      const assignments = Array.from(uniqueByProduct.entries()).flatMap(([productId, categories]) =>
        categories.map((categoryId) => ({
          product_id: productId,
          category_id: categoryId,
        }))
      )
      await this.withRetries(
        () => this.bigcommerceService.updateCategoryAssignments(assignments),
        'create category assignments'
      )
      return { updateds: uniqueByProduct.size, faileds: 0 }
    } catch (error: any) {
      Logger.error({ err: error }, 'Error actualizando categorias en BigCommerce')
      return { updateds: 0, faileds: productData.length }
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
