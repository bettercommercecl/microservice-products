import type { FormattedProductWithVariants } from '#interfaces/product-sync/sync.interfaces'
import Category from '#models/category'
import CategoryProduct from '#models/category_product'
import ChannelProduct from '#models/channel_product'
import Option from '#models/option'
import Product from '#models/product'
import Variant from '#models/variant'
import type { FormattedOption } from '#services/format_options_service'
import { createBatches } from '#utils/env_parser'
import { applyVariantBatchUpsert } from '#utils/release_variant_sku_conflicts'
import Logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/**
 *  persistir datos formateados en la base de datos.
 */
export default class SyncPersistenceService {
  private readonly logger = Logger.child({ service: 'SyncPersistenceService' })

  private static readonly VARIANT_BATCH_SIZE = 100
  private static readonly RELATION_BATCH_SIZE = 500

  /**
   * Persiste un lote completo de productos dentro de una transaccion .
   */
  async saveBatch(
    products: FormattedProductWithVariants[],
    options: FormattedOption[]
  ): Promise<void> {
    await db.transaction(async (trx) => {
      await this.saveProducts(products, trx)
      await this.saveVariants(products, trx)
      await this.syncProductCategories(products, trx)
      await this.syncChannelProducts(products, trx)
      await this.saveOptions(options, trx)
    })
  }

  private async saveProducts(
    products: FormattedProductWithVariants[],
    trx: TransactionClientContract
  ): Promise<void> {
    const productsToSave = products.map(
      ({ variants, _channels, _raw_categories, ...product }) => product
    )
    await Product.updateOrCreateMany('id', productsToSave, { client: trx })
  }

  /**
   * Persiste variantes: clave BC = id (PK). Si el id existe, actualiza esa fila;
   * si no, crea. El match previo por SKU primero provocaba updates en fila equivocada
   * y violacion de variants_sku_unique al cambiar SKUs.
   */
  private async saveVariants(
    products: FormattedProductWithVariants[],
    trx: TransactionClientContract
  ): Promise<void> {
    const allVariants = products.flatMap((p) => p.variants)
    if (allVariants.length === 0) return

    const variantBatches = createBatches(allVariants, SyncPersistenceService.VARIANT_BATCH_SIZE)
    for (const [idx, batch] of variantBatches.entries()) {
      await this.reconcileVariantBatch(batch, idx, trx)
    }
  }

  private async reconcileVariantBatch(
    variantBatch: any[],
    batchIdx: number,
    trx: TransactionClientContract
  ): Promise<void> {
    try {
      const ids = variantBatch.map((v) => v.id)
      const existing = await Variant.query({ client: trx }).whereIn('id', ids).select('id', 'sku')

      const existingIds = new Set(existing.map((v) => v.id))
      await applyVariantBatchUpsert(variantBatch, existingIds, trx)
    } catch (error: any) {
      this.logger.error(
        { error: error.message, batch: batchIdx + 1 },
        'Error en sub-lote de variantes'
      )
      throw error
    }
  }

  /**
   * Sincroniza relaciones producto-categoria filtrando categorias inexistentes
   * para evitar FK violations.
   * Quita en BD las categorias que ya no vienen de BC para cada producto del lote.
   */
  private async syncProductCategories(
    products: FormattedProductWithVariants[],
    trx: TransactionClientContract
  ): Promise<void> {
    if (products.length === 0) return

    const allCategoryIdsInBatch = [...new Set(products.flatMap((p) => p._raw_categories ?? []))]

    if (allCategoryIdsInBatch.length === 0) {
      await CategoryProduct.query({ client: trx })
        .whereIn(
          'product_id',
          products.map((p) => p.id)
        )
        .delete()
      return
    }

    const existingCategories = await Category.query({ client: trx })
      .whereIn('category_id', allCategoryIdsInBatch)
      .select('category_id')
    const validCategoryIds = new Set(existingCategories.map((c) => c.category_id))

    for (const product of products) {
      const desiredIds = [
        ...new Set((product._raw_categories ?? []).filter((cid) => validCategoryIds.has(cid))),
      ]

      if (desiredIds.length > 0) {
        await CategoryProduct.query({ client: trx })
          .where('product_id', product.id)
          .whereNotIn('category_id', desiredIds)
          .delete()
      } else {
        await CategoryProduct.query({ client: trx }).where('product_id', product.id).delete()
      }
    }

    const validRelations: { product_id: number; category_id: number }[] = []
    const seenPair = new Set<string>()
    let skippedInvalid = 0

    for (const product of products) {
      for (const categoryId of product._raw_categories ?? []) {
        if (!validCategoryIds.has(categoryId)) {
          skippedInvalid++
          continue
        }
        const key = `${product.id}:${categoryId}`
        if (seenPair.has(key)) continue
        seenPair.add(key)
        validRelations.push({ product_id: product.id, category_id: categoryId })
      }
    }

    if (skippedInvalid > 0) {
      this.logger.warn(
        { skipped: skippedInvalid },
        'Relaciones omitidas por categorias inexistentes en BD'
      )
    }

    if (validRelations.length === 0) return

    const batches = createBatches(validRelations, SyncPersistenceService.RELATION_BATCH_SIZE)
    for (const batch of batches) {
      await CategoryProduct.updateOrCreateMany(['product_id', 'category_id'], batch, {
        client: trx,
      })
    }
  }

  private async syncChannelProducts(
    products: FormattedProductWithVariants[],
    trx: TransactionClientContract
  ): Promise<void> {
    const allRelations: { product_id: number; channel_id: number }[] = []

    for (const product of products) {
      const channelIds = [
        ...new Set(product._channels.map((id) => Number(id)).filter((id) => id > 0)),
      ]
      if (channelIds.length > 0) {
        // Quitamos filas viejas del producto que ya no esten en el array.
        await ChannelProduct.query({ client: trx })
          .where('product_id', product.id)
          .whereNotIn('channel_id', channelIds)
          .delete()
      }
      for (const channelId of channelIds) {
        allRelations.push({ product_id: product.id, channel_id: channelId })
      }
    }

    if (allRelations.length === 0) return

    await ChannelProduct.updateOrCreateMany(['channel_id', 'product_id'], allRelations, {
      client: trx,
    })
  }

  private async saveOptions(
    options: FormattedOption[],
    trx: TransactionClientContract
  ): Promise<void> {
    if (options.length === 0) return
    await Option.updateOrCreateMany(['option_id', 'product_id'], options, { client: trx })
  }
}
