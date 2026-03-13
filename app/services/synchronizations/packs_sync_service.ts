import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import ProductPack from '#models/product_pack'
import CatalogSafeStock from '#models/catalog.safe.stock'
import {
  formatPacksRecords,
  type FormattedPackRecord,
  type InventoryEntry,
} from '#utils/format_packs_records'
import Product from '#models/product'
import BigcommerceRateLimitInterceptor from '#infrastructure/interceptors/bigcommerce_rate_limit_interceptor'
import Logger from '@adonisjs/core/services/logger'
import Database from '@adonisjs/lucid/services/db'
import env from '#start/env'

interface PackItem {
  product?: string
  quantity?: number
  is_variant?: boolean
  variant_id?: number
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
    const percentageAvailable =
      status.quota > 0 ? (status.requestsLeft / status.quota) * 100 : 0

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
    if (!env.get('PACKS_CATEGORY_ID')) {
      Logger.info('Sync packs: PACKS_CATEGORY_ID no configurado, omitiendo')
      return { status: 200, message: 'PACKS_CATEGORY_ID no configurado', data: [] }
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

      const prepareDataPacks = await this.prepareDataPacks(
        allPacksWithVariants,
        deadline
      )
      const filterPacksWithProducts = prepareDataPacks.filter(
        (pack) => (pack?.items_packs?.length ?? 0) > 0
      )
      const createFormatForDatabase =
        await this.formatProductsPacks(filterPacksWithProducts)

      if (createFormatForDatabase?.length > 0) {
        Logger.info(
          `Sync packs: guardando ${createFormatForDatabase.length} registros en BD`
        )
        return await this.saveProductsOfPacksInDatabase(createFormatForDatabase)
      }

      Logger.info('Sync packs: no hay registros para guardar tras formatear')
      return { status: 200, message: 'No hay packs para sincronizar', data: [] }
    } catch (error: any) {
      Logger.error({ err: error }, 'Error critico en syncPacksFromBigcommerce')
      throw error
    } finally {
      try {
        Logger.info('Sync packs: finalizando, obteniendo packs con stock cero')
        const packIds = await this.getPackIdsWithZeroStock()
        if (packIds.length > 0) {
          Logger.info(
            `Sync packs: actualizando visibilidad (is_visible=false) para ${packIds.length} packs`
          )
          await this.updateProductsVisibility(packIds)
        }
        Logger.info('Sync packs: proceso finalizado')
      } catch (error: any) {
        Logger.error(
          { err: error },
          'Sync packs: error en actualizacion de visibilidad'
        )
      }
    }
  }

  private async formatProductsPacks(
    packs: PackWithItems[]
  ): Promise<FormattedPackRecord[]> {
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
        const inventoryProducts = await CatalogSafeStock.query().whereIn(
          'sku',
          skuBatch
        )
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
        Logger.error(
          { err: error },
          'Error obteniendo inventario/variants para lote de SKUs'
        )
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

    const formattedPacks = formatPacksRecords(
      packs,
      inventoryMap,
      variantReserveMap
    )

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

  private async saveProductsOfPacksInDatabase(
    packs: FormattedPackRecord[]
  ): Promise<{ status: number; message?: string; data?: any }> {
    const trx = await Database.transaction()

    try {
      Logger.info('Sync packs: eliminando registros anteriores de products_packs')
      await ProductPack.query().useTransaction(trx).delete()
      Logger.info(`Sync packs: insertando ${packs.length} registros`)
      await ProductPack.createMany(packs, { client: trx })
      await trx.commit()
      const totalPacks = await ProductPack.all()
      Logger.info(
        `Sync packs: guardado correcto, ${totalPacks.length} packs en BD`
      )
      return { status: 201, data: totalPacks }
    } catch (error: any) {
      await trx.rollback()
      Logger.error(
        { err: error },
        'Sync packs: error en guardado, transaccion revertida'
      )
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
            const isPackOfVariants =
              item?.variants && item.variants.length > 1

            item.items_packs = item.items_packs ?? []

            if (!isPackOfVariants && item.variants?.length === 1) {
              const singleVariantId = item.variants[0].id
              item.items_packs = item.items_packs.map((it: PackItem) => ({
                ...it,
                variant_id: it.variant_id ?? singleVariantId,
                is_variant: false,
              }))
            }

            if (isPackOfVariants) {
              const allVariants: PackItem[] = []

              for (let j = 0; j < (item.variants?.length ?? 0); j += VARIANT_BATCH_SIZE) {
                this.shouldAbort(deadline)
                const variantBatch = (item.variants ?? []).slice(
                  j,
                  j + VARIANT_BATCH_SIZE
                )

                const metafieldsResults =
                  await this.bigcommerceService.getMetafieldsByPacksVariants(
                    variantBatch.map((v) => ({
                      id: v.id,
                      product_id: v.product_id,
                    }))
                  )

                for (let k = 0; k < variantBatch.length; k++) {
                  const variantPack = variantBatch[k]
                  const royalProduct = metafieldsResults[k] ?? []

                  const formattedMetafieldsVariantsPacks = royalProduct
                    .filter((m: { key: string }) => m.key === 'packs')
                    .flatMap((m: { value: string }) => {
                      let metafields: PackItem[] = []
                      try {
                        metafields = m.value ? JSON.parse(m.value) : []
                      } catch {
                        metafields = []
                      }
                      return metafields.map((it: PackItem) => ({
                        ...it,
                        variant_id: variantPack.id,
                        is_variant: true,
                      }))
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
            Logger.error(
              { err: error },
              `Error procesando pack ${item?.id}`
            )
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
            const variantWithId = variantGroup.find((v) => v.is_variant === true)
            const variantId = variantWithId?.variant_id ?? undefined
            return variantGroup.map((v) => ({
              ...v,
              is_variant: true,
              variant_id: v.variant_id ?? variantId,
            }))
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
              Logger.error(
                `Rate limit (429) obteniendo variantes para pack ${pack.id}`
              )
            } else {
              Logger.error(
                { err: error },
                `Error obteniendo variantes para pack ${pack.id}`
              )
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

  private async getPackIdsWithZeroStock(): Promise<number[]> {
    const packs = await Database.from('products_packs')
      .distinct('pack_id')
      .where('stock', 0)
      .andWhere('is_variant', false)
      .select('pack_id')

    return packs.map((p: { pack_id: number }) => p.pack_id)
  }

  private async updateProductsVisibility(packIds: number[]): Promise<void> {
    await Product.query()
      .whereIn('id', packIds)
      .update({ is_visible: false })
  }
}
