import Variant from '#models/variant'
import Logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

const log = Logger.child({ util: 'releaseVariantSkuConflicts' })

/** Clave BC = id (PK local). Si existe fila con ese id, update; si no, create. */
export function partitionVariantsByBigCommerceId<T extends { id: number }>(
  variantBatch: T[],
  existingIds: Set<number>
): { toUpdate: T[]; toCreate: T[] } {
  const toUpdate: T[] = []
  const toCreate: T[] = []
  for (const variant of variantBatch) {
    if (existingIds.has(variant.id)) toUpdate.push(variant)
    else toCreate.push(variant)
  }
  return { toUpdate, toCreate }
}

/**
 * Libera variants_sku_unique antes de upsert de un lote: filas que aun tienen un SKU
 * que otra variante del lote va a tomar pasan a un SKU temporal (_sync_{id}).
 * Usado por sync global (v2) y sync por canal (v1).
 */
export async function releaseVariantSkuConflicts(
  toUpdate: Array<{ id: number; sku: unknown }>,
  toCreate: Array<{ sku: unknown }>,
  trx: TransactionClientContract
): Promise<void> {
  const norm = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  const ownerBySku = new Map<string, number>()
  for (const v of toUpdate) {
    const sku = norm(v.sku)
    if (!sku) continue
    const prev = ownerBySku.get(sku)
    if (prev !== undefined && prev !== v.id) {
      log.warn(
        { sku, ids: [prev, v.id] },
        'Mismo SKU en varias variantes del lote; se reserva al ultimo id del lote'
      )
    }
    ownerBySku.set(sku, v.id)
  }
  const createSkus = new Set(
    toCreate.map((v) => norm(v.sku)).filter((s): s is string => s.length > 0)
  )
  const skus = [...new Set([...ownerBySku.keys(), ...createSkus])]
  if (skus.length === 0) return

  const occupants = await Variant.query({ client: trx }).whereIn('sku', skus).select('id', 'sku')

  for (const row of occupants) {
    const sku = norm(row.sku)
    const desiredId = ownerBySku.get(sku)
    if (desiredId !== undefined) {
      if (row.id === desiredId) continue
      await Variant.query({ client: trx })
        .where('id', row.id)
        .update({ sku: `_sync_${row.id}`, updated_at: new Date() })
      continue
    }
    if (createSkus.has(sku)) {
      await Variant.query({ client: trx })
        .where('id', row.id)
        .update({ sku: `_sync_${row.id}`, updated_at: new Date() })
    }
  }
}
