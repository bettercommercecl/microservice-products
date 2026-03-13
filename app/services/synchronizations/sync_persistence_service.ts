import type { FormattedProductWithVariants } from '#interfaces/product-sync/sync.interfaces'
import type { FormattedOption } from '../format_options_service.js'
import CategoryProduct from '#models/category_product'
import Category from '#models/category'
import ChannelProduct from '#models/channel_product'
import Option from '#models/option'
import Product from '#models/product'
import Variant from '#models/variant'
import Logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import pLimit from 'p-limit'
import { createBatches } from '#utils/env_parser'

/**
 * Responsabilidad unica: persistir datos formateados en la base de datos.
 * No formatea, no llama APIs externas, solo escribe.
 */
export default class SyncPersistenceService {
  private readonly logger = Logger.child({ service: 'SyncPersistenceService' })

  private static readonly VARIANT_BATCH_SIZE = 100
  private static readonly RELATION_BATCH_SIZE = 500

  /**
   * Persiste un lote completo de productos dentro de una transaccion atomica.
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
   * Persiste variantes con logica de reconciliacion: si existe por SKU, actualiza;
   * si existe por ID, actualiza; si no existe, crea.
   */
  private async saveVariants(
    products: FormattedProductWithVariants[],
    trx: TransactionClientContract
  ): Promise<void> {
    const allVariants = products.flatMap((p) => p.variants)
    if (allVariants.length === 0) return

    const variantBatches = createBatches(
      allVariants,
      SyncPersistenceService.VARIANT_BATCH_SIZE
    )
    const limit = pLimit(3)

    await Promise.all(
      variantBatches.map((batch, idx) =>
        limit(() => this.reconcileVariantBatch(batch, idx, trx))
      )
    )
  }

  private async reconcileVariantBatch(
    variantBatch: any[],
    batchIdx: number,
    trx: TransactionClientContract
  ): Promise<void> {
    try {
      const skus = variantBatch.map((v) => v.sku)
      const ids = variantBatch.map((v) => v.id)

      const existing = await Variant.query({ client: trx })
        .where((q) => q.whereIn('sku', skus).orWhereIn('id', ids))
        .select('id', 'sku')

      const skuToId = new Map(existing.map((v) => [v.sku, v.id]))
      const existingIds = new Set(existing.map((v) => v.id))

      const toUpdate: any[] = []
      const toCreate: any[] = []

      for (const variant of variantBatch) {
        const matchedId = skuToId.get(variant.sku)

        if (matchedId) {
          const { id, ...rest } = variant
          toUpdate.push({ ...rest, id: matchedId })
        } else if (existingIds.has(variant.id)) {
          toUpdate.push(variant)
        } else {
          toCreate.push(variant)
        }
      }

      if (toUpdate.length > 0) {
        await Variant.updateOrCreateMany('id', toUpdate, { client: trx })
      }
      if (toCreate.length > 0) {
        await Variant.createMany(toCreate, { client: trx })
      }
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
   */
  private async syncProductCategories(
    products: FormattedProductWithVariants[],
    trx: TransactionClientContract
  ): Promise<void> {
    const allRelations: { product_id: number; category_id: number }[] = []

    for (const product of products) {
      for (const categoryId of product._raw_categories) {
        allRelations.push({ product_id: product.id, category_id: categoryId })
      }
    }

    if (allRelations.length === 0) return

    const uniqueCategoryIds = [...new Set(allRelations.map((r) => r.category_id))]
    const existingCategories = await Category.query({ client: trx })
      .whereIn('category_id', uniqueCategoryIds)
      .select('category_id')
    const validCategoryIds = new Set(existingCategories.map((c) => c.category_id))

    const validRelations = allRelations.filter((r) => validCategoryIds.has(r.category_id))

    if (validRelations.length < allRelations.length) {
      this.logger.warn(
        { skipped: allRelations.length - validRelations.length },
        'Relaciones omitidas por categorias inexistentes'
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
      for (const channelId of product._channels) {
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
