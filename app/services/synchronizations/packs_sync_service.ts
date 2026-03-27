import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import BigcommerceRateLimitInterceptor from '#infrastructure/interceptors/bigcommerce_rate_limit_interceptor'
import CatalogSafeStock from '#models/catalog_safe_stock'
import ProductPack from '#models/product_pack'
import env from '#start/env'
import {
  formatPacksRecords,
  type FormattedPackRecord,
  type InventoryEntry,
} from '#utils/format_packs_records'
import Logger from '@adonisjs/core/services/logger'
import Database from '@adonisjs/lucid/services/db'

interface PackItem {
  product?: string
  quantity?: number
  is_variant?: boolean
  variant_id?: number
  /** variants.id del producto pack (product_id = pack_id) */
  pack_variant_id?: number
}

interface PackWithItems {
  id: number
  items_packs?: PackItem[]
  variants?: Array<{ id: number; product_id: number }>
}

/**
 * Sincroniza productos pack desde BigCommerce hacia products_packs.
 * Soporta packs simples (items a nivel producto) y packs de variantes (items por metafield).
 */
export default class PacksSyncService {
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
        if (!is429 || attempt >= this.MAX_RETRIES) {
          throw error
        }
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
      throw new Error('Sincronizacion de packs abortada por timeout global')
    }
  }

  private getAdaptiveBatchConfig(): {
    batchSize: number
    delay: number
    requestsLeft: number
    quota: number
  } {
    const interceptor = BigcommerceRateLimitInterceptor.getInstance()
    const status = interceptor.getStatus()
    const percentageAvailable = status.quota > 0 ? (status.requestsLeft / status.quota) * 100 : 0

    let batchSize: number
    let delay: number

    if (percentageAvailable > 80 && status.requestsLeft > 100) {
      batchSize = 30
      delay = 150
    } else if (percentageAvailable > 50 && status.requestsLeft > 50) {
      batchSize = 20
      delay = 300
    } else if (percentageAvailable > 20 && status.requestsLeft > 20) {
      batchSize = 10
      delay = 500
    } else if (percentageAvailable > 10 && status.requestsLeft > 10) {
      batchSize = 5
      delay = 800
    } else {
      batchSize = 3
      delay = Math.max(1500, status.timeResetMs || 2000)
    }

    return {
      batchSize,
      delay,
      requestsLeft: status.requestsLeft,
      quota: status.quota,
    }
  }

  async syncPacksFromBigcommerce(): Promise<{
    status: number
    message?: string
    data?: any
  }> {
    if (!env.get('ID_PACKS')) {
      Logger.info('Sync packs: ID_PACKS no configurado, omitiendo')
      return { status: 200, message: 'ID_PACKS no configurado', data: [] }
    }

    const deadline = Date.now() + this.MAX_SYNC_MS

    try {
      let productsPacks = await this.bigcommerceService.getAllProductsPacks()

      productsPacks = productsPacks.map((pack) => {
        if (pack.itemsPacks && !pack.items_packs) {
          pack.items_packs = pack.itemsPacks
        }
        return pack
      })

      this.shouldAbort(deadline)

      let allPacksWithVariants = await this.getVariantsOfPacks(
        productsPacks as PackWithItems[],
        deadline
      )
      this.shouldAbort(deadline)

      const prepareDataPacks = await this.prepareDataPacks(allPacksWithVariants, deadline)
      const filterPacksWithProducts = prepareDataPacks.filter(
        (pack) => (pack?.items_packs?.length ?? 0) > 0
      )
      const createFormatForDatabase = await this.formatProductsPacks(filterPacksWithProducts)

      if (createFormatForDatabase?.length > 0) {
        Logger.info(`Sync packs: guardando ${createFormatForDatabase.length} registros en BD`)
        return await this.saveProductsOfPacksInDatabase(createFormatForDatabase)
      }

      Logger.info('Sync packs: no hay registros para guardar tras formatear')
      return { status: 200, message: 'No hay packs para sincronizar', data: [] }
    } catch (error: any) {
      Logger.error({ err: error }, 'Error critico en syncPacksFromBigcommerce')
      throw error
    } finally {
      try {
        Logger.info(
          'Sync packs: finalizando, lineas hijo en 0 -> stock 0 en variantes de pack afectadas (sin ocultar producto padre)'
        )
        const variantTargets = await this.getDistinctPackVariantTargetsWithZeroStock()
        const packsMissingPv = await this.getDistinctPackIdsWithZeroStockMissingPackVariant()
        const fallbackTargets = await this.resolveDefaultPackVariantTargets(packsMissingPv)
        const mergedTargets = this.mergePackVariantTargets(variantTargets, fallbackTargets)
        if (mergedTargets.length > 0) {
          Logger.info(
            `Sync packs: variants.stock=0 para ${mergedTargets.length} variantes de pack (product_id=pack_id)`
          )
          await this.updatePackVariantsStockToZero(mergedTargets)
        }
        Logger.info('Sync packs: proceso finalizado')
      } catch (error: any) {
        Logger.error({ err: error }, 'Sync packs: error en actualizacion post-sync de packs')
      }
    }
  }

  private async formatProductsPacks(packs: PackWithItems[]): Promise<FormattedPackRecord[]> {
    if (!packs.length) return []

    const allSkus = new Set<string>()
    packs.forEach((pack) => {
      pack.items_packs?.forEach((item: PackItem) => {
        if (item?.product && typeof item.product === 'string') {
          allSkus.add(item.product.trim())
        }
      })
    })

    const SKU_BATCH_SIZE = 500
    const inventoryMap = new Map<string, InventoryEntry>()
    const variantReserveMap = new Map<string, string | null>()
    const skuArray = Array.from(allSkus)

    for (let i = 0; i < skuArray.length; i += SKU_BATCH_SIZE) {
      const skuBatch = skuArray.slice(i, i + SKU_BATCH_SIZE)
      try {
        const inventoryProducts = await CatalogSafeStock.query().whereIn('sku', skuBatch)
        inventoryProducts.forEach((product) => {
          if (product.sku) {
            inventoryMap.set(product.sku.trim(), {
              product_id: product.product_id,
              sku: product.sku,
              safety_stock: product.safety_stock,
              available_to_sell: product.available_to_sell,
              variant_id: product.variant_id,
              bin_picking_number: product.bin_picking_number,
            })
          }
        })

        const variants = await Database.from('variants')
          .select('sku', 'reserve', 'id')
          .whereIn('sku', skuBatch)
        variants.forEach((variant: { sku: string; reserve: string | null; id: number }) => {
          if (variant.sku) {
            variantReserveMap.set(variant.sku.trim(), variant.reserve ?? null)
          }
        })
      } catch (error: any) {
        Logger.error({ err: error }, 'Error obteniendo inventario/variants para lote de SKUs')
      }
    }

    const missingSkus = new Set<string>()
    const invalidSkus = new Set<string>()

    for (const pack of packs) {
      for (const item of pack.items_packs ?? []) {
        if (!item?.product || typeof item.product !== 'string') {
          invalidSkus.add(`pack-${pack.id}`)
          continue
        }
        const sku = item.product.trim()
        if (!inventoryMap.has(sku)) {
          missingSkus.add(sku)
        }
      }
    }

    const formattedPacks = formatPacksRecords(packs, inventoryMap, variantReserveMap)

    if (missingSkus.size > 0) {
      const sampleSkus = Array.from(missingSkus).slice(0, 10).join(', ')
      Logger.warn(
        `${missingSkus.size} SKUs no encontrados en inventario (primeros 10: ${sampleSkus})`
      )
    }

    if (invalidSkus.size > 0) {
      Logger.warn(`${invalidSkus.size} packs con items sin SKU valido`)
    }

    return formattedPacks
  }

  /** Clave de linea en snapshot: (pack_id, line_index). Permite misma variante en varias lineas. */
  private snapshotKeyFromRecord(row: FormattedPackRecord): string {
    return `${row.pack_id}\0${row.line_index}`
  }

  private snapshotKeyFromModel(row: ProductPack): string {
    return `${row.pack_id}\0${row.line_index}`
  }

  /**
   * Upsert por (pack_id, line_index) + borrado de huerfanos, sin vaciar la tabla.
   * Preserva id (table_id) cuando la linea en esa posicion sigue existiendo.
   */
  private async saveProductsOfPacksInDatabase(
    packs: FormattedPackRecord[]
  ): Promise<{ status: number; message?: string; data?: any }> {
    const trx = await Database.transaction()

    try {
      const newPackIds = [...new Set(packs.map((p) => p.pack_id))]
      const keySet = new Set(packs.map((p) => this.snapshotKeyFromRecord(p)))

      Logger.info(`Sync packs: upsert ${packs.length} lineas en ${newPackIds.length} packs (sin truncate)`)

      if (newPackIds.length > 0) {
        await ProductPack.query({ client: trx }).whereNotIn('pack_id', newPackIds).delete()
      }

      if (packs.length > 0) {
        await ProductPack.updateOrCreateMany(['pack_id', 'line_index'], packs, { client: trx })
      }

      const existingRows = await ProductPack.query({ client: trx }).whereIn('pack_id', newPackIds)
      const orphanIds = existingRows
        .filter((row) => !keySet.has(this.snapshotKeyFromModel(row)))
        .map((row) => row.id)

      const CHUNK = 500
      for (let i = 0; i < orphanIds.length; i += CHUNK) {
        const chunk = orphanIds.slice(i, i + CHUNK)
        await ProductPack.query({ client: trx }).whereIn('id', chunk).delete()
      }

      if (orphanIds.length > 0) {
        Logger.info(`Sync packs: eliminadas ${orphanIds.length} lineas huerfanas`)
      }

      await trx.commit()
      const totalPacks = await ProductPack.all()
      Logger.info(`Sync packs: guardado correcto, ${totalPacks.length} filas en BD`)
      return { status: 201, data: totalPacks }
    } catch (error: any) {
      await trx.rollback()
      Logger.error({ err: error }, 'Sync packs: error en guardado, transaccion revertida')
      return {
        status: 500,
        message: 'Ocurrio un error al sincronizar los datos de packs.',
        data: { error: error?.message },
      }
    }
  }

  private async prepareDataPacks(
    packList: PackWithItems[],
    deadline: number
  ): Promise<PackWithItems[]> {
    const results: PackWithItems[] = []

    for (let i = 0; i < packList.length; ) {
      this.shouldAbort(deadline)
      const config = this.getAdaptiveBatchConfig()
      const BATCH_SIZE = config.batchSize
      const VARIANT_BATCH_SIZE = Math.max(3, Math.floor(config.batchSize / 3))
      let DELAY_BETWEEN_BATCHES = config.delay
      let DELAY_BETWEEN_VARIANT_BATCHES = Math.max(200, Math.floor(config.delay / 2))
      const batch = packList.slice(i, i + BATCH_SIZE)
      let has429InBatch = false

      const batchResults = await Promise.allSettled(
        batch.map(async (item) => {
          try {
            const isPackOfVariants = item?.variants && item.variants.length > 1

            item.items_packs = item.items_packs ?? []

            // variant_id del item BC no se usa para hijo; pack_variant_id = variante del pack en BC.
            if (!isPackOfVariants && item.variants?.length === 1) {
              const packVariantId = item.variants[0].id
              item.items_packs = item.items_packs.map((it: PackItem) => {
                const { variant_id: _packVariantIgnored, ...rest } = it
                return { ...rest, is_variant: false, pack_variant_id: packVariantId }
              })
            }

            if (isPackOfVariants) {
              const allVariants: PackItem[] = []

              for (let j = 0; j < (item.variants?.length ?? 0); j += VARIANT_BATCH_SIZE) {
                this.shouldAbort(deadline)
                const variantBatch = (item.variants ?? []).slice(j, j + VARIANT_BATCH_SIZE)

                const metafieldsResults =
                  await this.bigcommerceService.getMetafieldsByPacksVariants(
                    variantBatch.map((v) => ({
                      id: v.id,
                      product_id: v.product_id,
                    }))
                  )

                for (let k = 0; k < variantBatch.length; k++) {
                  const royalProduct = metafieldsResults[k] ?? []
                  const linePackVariantId = variantBatch[k].id

                  const formattedMetafieldsVariantsPacks = royalProduct
                    .filter((m: { key: string }) => m.key === 'packs')
                    .flatMap((m: { value: string }) => {
                      let metafields: PackItem[] = []
                      try {
                        metafields = m.value ? JSON.parse(m.value) : []
                      } catch {
                        metafields = []
                      }
                      return metafields.map((it: PackItem) => {
                        const { variant_id: _packVariantIgnored, ...rest } = it
                        return {
                          ...rest,
                          is_variant: true,
                          pack_variant_id: linePackVariantId,
                        }
                      })
                    })

                  allVariants.push(...formattedMetafieldsVariantsPacks)
                }

                if (j + VARIANT_BATCH_SIZE < (item.variants?.length ?? 0)) {
                  await this.sleep(DELAY_BETWEEN_VARIANT_BATCHES)
                }
              }

              if (allVariants.length > 0) {
                item.items_packs.push(...allVariants)
                Logger.info(
                  `Sync packs: pack ${item.id} (variantes) agregados ${allVariants.length} items desde metafield packs por variante`
                )
              }
            }

            return item
          } catch (error: any) {
            Logger.error({ err: error }, `Error procesando pack ${item?.id}`)
            item.items_packs = item.items_packs ?? []
            return item
          }
        })
      )

      const failedPacks = batchResults.filter((r) => r.status === 'rejected')
      const has429InPacks = failedPacks.some(
        (r) =>
          (r as PromiseRejectedResult).reason?.response?.status === 429 ||
          (r as PromiseRejectedResult).reason?.message?.includes('429') ||
          (r as PromiseRejectedResult).reason?.message?.includes('rate limit')
      )

      if (has429InBatch || has429InPacks) {
        DELAY_BETWEEN_BATCHES = Math.min(DELAY_BETWEEN_BATCHES * 2, 5000)
      }

      const successfulPacks = batchResults
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<PackWithItems>).value)

      const rejectedIndices = batchResults
        .map((r, idx) => (r.status === 'rejected' ? idx : -1))
        .filter((idx) => idx !== -1)

      rejectedIndices.forEach((idx) => {
        const pack = batch[idx]
        pack.items_packs = pack.items_packs ?? []
        results.push(pack)
      })

      results.push(...successfulPacks)

      i += BATCH_SIZE

      if (i < packList.length) {
        await this.sleep(DELAY_BETWEEN_BATCHES)
      }
    }

    let processedPacks = results

    processedPacks = processedPacks.map((pack) => {
      if (pack.items_packs?.length) {
        const updatedItemsPacks = pack.items_packs.map((variantGroup: PackItem | PackItem[]) => {
          if (Array.isArray(variantGroup)) {
            return variantGroup.map((v) => {
              const { variant_id: _ignored, ...rest } = v
              return { ...rest, is_variant: true }
            })
          }
          return variantGroup
        })
        pack.items_packs = updatedItemsPacks.flat()
      }
      return pack
    })

    return processedPacks
  }

  private async getVariantsOfPacks(
    packList: PackWithItems[],
    deadline: number
  ): Promise<PackWithItems[]> {
    const results: PackWithItems[] = []

    for (let i = 0; i < packList.length; ) {
      this.shouldAbort(deadline)
      const config = this.getAdaptiveBatchConfig()
      const BATCH_SIZE = config.batchSize
      let DELAY_BETWEEN_BATCHES = config.delay
      const batch = packList.slice(i, i + BATCH_SIZE)

      const batchResults = await Promise.allSettled(
        batch.map(async (pack) => {
          try {
            const variant = await this.withRetries(
              () => this.bigcommerceService.getVariantsOfProduct(pack.id),
              `variantes pack ${pack.id}`
            )
            pack.variants = (variant ?? []).map((v) => ({
              id: v.id,
              product_id: pack.id,
            }))
            return pack
          } catch (error: any) {
            const is429Error =
              error?.response?.status === 429 ||
              error?.message?.includes('429') ||
              error?.message?.includes('rate limit')
            if (is429Error) {
              Logger.error(`Rate limit (429) obteniendo variantes para pack ${pack.id}`)
            } else {
              Logger.error({ err: error }, `Error obteniendo variantes para pack ${pack.id}`)
            }
            pack.variants = []
            return pack
          }
        })
      )

      const has429Errors = batchResults.some(
        (r) =>
          r.status === 'rejected' &&
          ((r as PromiseRejectedResult).reason?.response?.status === 429 ||
            (r as PromiseRejectedResult).reason?.message?.includes('429') ||
            (r as PromiseRejectedResult).reason?.message?.includes('rate limit'))
      )

      if (has429Errors) {
        DELAY_BETWEEN_BATCHES = Math.min(DELAY_BETWEEN_BATCHES * 2, 5000)
      }

      const successfulPacks = batchResults
        .filter((r) => r.status === 'fulfilled')
        .map((r) => (r as PromiseFulfilledResult<PackWithItems>).value)

      const rejectedIndices = batchResults
        .map((r, idx) => (r.status === 'rejected' ? idx : -1))
        .filter((idx) => idx !== -1)

      rejectedIndices.forEach((idx) => {
        const pack = batch[idx]
        pack.variants = []
        results.push(pack)
      })

      results.push(...successfulPacks)

      i += BATCH_SIZE

      if (i < packList.length) {
        await this.sleep(DELAY_BETWEEN_BATCHES)
      }
    }

    return results
  }

  /**
   * Pares (pack_id, pack_variant_id) distintos donde una linea quedo en 0.
   * pack_variant_id = variants.id con variants.product_id = pack_id.
   */
  private async getDistinctPackVariantTargetsWithZeroStock(): Promise<
    Array<{ pack_id: number; pack_variant_id: number }>
  > {
    const rows = await Database.from('products_packs')
      .distinct('pack_id', 'pack_variant_id')
      .where('stock', 0)
      .whereNotNull('pack_variant_id')
      .select('pack_id', 'pack_variant_id')
    return rows.map((r: { pack_id: number; pack_variant_id: number }) => ({
      pack_id: r.pack_id,
      pack_variant_id: r.pack_variant_id,
    }))
  }

  private async getDistinctPackIdsWithZeroStockMissingPackVariant(): Promise<number[]> {
    const rows = await Database.from('products_packs')
      .distinct('pack_id')
      .where('stock', 0)
      .whereNull('pack_variant_id')
      .select('pack_id')
    return rows.map((r: { pack_id: number }) => r.pack_id)
  }

  /** Si falta pack_variant_id (legacy / sin variantes BC), primera variante del pack por id */
  private async resolveDefaultPackVariantTargets(
    packIds: number[]
  ): Promise<Array<{ pack_id: number; pack_variant_id: number }>> {
    if (!packIds.length) return []
    const rows = (await Database.from('variants')
      .select('product_id', 'id')
      .whereIn('product_id', packIds)
      .orderBy('product_id', 'asc')
      .orderBy('id', 'asc')) as Array<{ product_id: number; id: number }>

    const seen = new Set<number>()
    const out: Array<{ pack_id: number; pack_variant_id: number }> = []
    for (const r of rows) {
      if (!seen.has(r.product_id)) {
        seen.add(r.product_id)
        out.push({ pack_id: r.product_id, pack_variant_id: r.id })
      }
    }
    return out
  }

  private mergePackVariantTargets(
    a: Array<{ pack_id: number; pack_variant_id: number }>,
    b: Array<{ pack_id: number; pack_variant_id: number }>
  ): Array<{ pack_id: number; pack_variant_id: number }> {
    const map = new Map<string, { pack_id: number; pack_variant_id: number }>()
    for (const t of [...a, ...b]) {
      map.set(`${t.pack_id}\0${t.pack_variant_id}`, t)
    }
    return [...map.values()]
  }

  private async updatePackVariantsStockToZero(
    targets: Array<{ pack_id: number; pack_variant_id: number }>
  ): Promise<void> {
    const CHUNK = 80
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK)
      await Database.transaction(async (trx) => {
        for (const { pack_id, pack_variant_id } of chunk) {
          await trx.from('variants').where('product_id', pack_id).where('id', pack_variant_id).update({
            stock: 0,
            updated_at: new Date(),
          })
        }
      })
    }
  }

}
