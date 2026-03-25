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
  toUpdate: Array<{ id: number; sku?: unknown }>,
  toCreate: Array<{ sku?: unknown }>,
  trx: TransactionClientContract
): Promise<void> {
  const norm = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  const ownerBySku = new Map<string, number>()
  for (const v of toUpdate) {
    const sku = norm(v.sku)
    if (!sku) continue
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

/**
 * Mismo SKU en varias filas del mismo toUpdate: solo el id menor conserva el SKU de BC;
 * el resto recibe un SKU temporal unico (evita duplicate key en updateOrCreateMany).
 */
export function assignUniqueSkusForIntraBatchDuplicates<T extends { id: number; sku?: unknown }>(
  toUpdate: T[]
): T[] {
  const norm = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  const clones = toUpdate.map((v) => ({ ...v }))
  const bySku = new Map<string, T[]>()
  for (const v of clones) {
    const sku = norm(v.sku)
    if (!sku) continue
    if (!bySku.has(sku)) bySku.set(sku, [])
    bySku.get(sku)!.push(v)
  }
  for (const [sku, group] of bySku) {
    if (group.length <= 1) continue
    group.sort((a, b) => a.id - b.id)
    for (let i = 1; i < group.length; i++) {
      log.warn(
        { sku, keptId: group[0].id, reassignedId: group[i].id },
        'SKU repetido en el mismo lote; se asigna SKU temporal a variantes extra'
      )
      group[i].sku = `_sync_dup_${group[i].id}`
    }
  }
  return clones
}

/**
 * variants.sku es UNIQUE: solo una fila puede tener ''. BC a veces envia SKU vacio en varias variantes
 * y Postgres responde Key (sku)=() already exists.
 */
export function assignPlaceholderSkuIfEmpty<T extends { id: number; sku?: unknown }>(rows: T[]): T[] {
  const norm = (s: unknown) => (typeof s === 'string' ? s.trim() : '')
  return rows.map((row) => {
    if (norm(row.sku).length > 0) return row
    log.warn({ variantId: row.id }, 'SKU vacio; placeholder unico para cumplir variants_sku_unique')
    return { ...row, sku: `__missing_sku__${row.id}` }
  })
}

/** Quita los SKU objetivo del lote de filas a actualizar para que el bulk update no choque entre filas (intercambios, etc.). */
export async function stashVariantRowsWithBatchPlaceholderSku(
  toUpdate: Array<{ id: number }>,
  trx: TransactionClientContract
): Promise<void> {
  const now = new Date()
  for (const v of toUpdate) {
    await Variant.query({ client: trx }).where('id', v.id).update({
      sku: `_batch_tmp_${v.id}`,
      updated_at: now,
    })
  }
}

/**
 * Flujo completo: particion, dedup intra-lote, stash, liberar ocupantes, update, creates.
 * Generico para aceptar FormattedVariantForModel u otros payloads con id + sku.
 */
export async function applyVariantBatchUpsert<T extends { id: number; sku?: unknown }>(
  variantBatch: T[],
  existingIds: Set<number>,
  trx: TransactionClientContract
): Promise<void> {
  const { toUpdate, toCreate } = partitionVariantsByBigCommerceId(variantBatch, existingIds)
  const prepared = assignPlaceholderSkuIfEmpty(assignUniqueSkusForIntraBatchDuplicates(toUpdate))
  const toCreateReady = assignPlaceholderSkuIfEmpty(toCreate.map((r) => ({ ...r })))

  if (prepared.length > 0) {
    await stashVariantRowsWithBatchPlaceholderSku(prepared, trx)
  }

  await releaseVariantSkuConflicts(prepared, toCreateReady, trx)

  if (prepared.length > 0) {
    await Variant.updateOrCreateMany('id', prepared as Partial<Variant>[], { client: trx })
  }

  await releaseVariantSkuConflicts([], toCreateReady, trx)

  if (toCreateReady.length > 0) {
    await Variant.createMany(toCreateReady as Partial<Variant>[], { client: trx })
  }
}
