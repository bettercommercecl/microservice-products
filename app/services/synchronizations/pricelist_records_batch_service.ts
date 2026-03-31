import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import type { PriceListRecord } from '#infrastructure/bigcommerce/modules/pricelists/interfaces/pricelist_record.interface'
import PricelistVariantRecord from '#models/pricelist_variant_record'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import db from '@adonisjs/lucid/services/db'
import { DateTime } from 'luxon'

/**
 * Resuelve LIST_PRICE_ID_{COUNTRY_CODE} o LIST_PRICE_ID (fallback).
 */
export function getListPriceIdForCountry(): number {
  const cc = env.get('COUNTRY_CODE')
  const raw = process.env[`LIST_PRICE_ID_${cc}`] ?? process.env.LIST_PRICE_ID
  const n = Number(raw)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(
      `Define LIST_PRICE_ID_${cc} o LIST_PRICE_ID en .env para sincronizar precios desde el price list de BigCommerce`
    )
  }
  return n
}

/**
 * Un producto pertenece al pais si al menos una variante tiene registro en el price list.
 */
export function filterProductsByPricelistMembership<
  T extends { id: number; variants?: { id: number }[] },
>(products: T[], variantIdsInPricelist: Set<number>): { kept: T[]; excludedIds: number[] } {
  const kept: T[] = []
  const excludedIds: number[] = []

  for (const p of products) {
    const variants = p.variants || []
    if (variants.length === 0) {
      excludedIds.push(p.id)
      continue
    }
    if (variants.some((v) => variantIdsInPricelist.has(v.id))) {
      kept.push(p)
    } else {
      excludedIds.push(p.id)
    }
  }

  return { kept, excludedIds }
}

/**
 * 1) Carga todas las paginas del price list en BigCommerce y las persiste en DB.
 * 2) En cada lote de productos solo se leen de DB las filas de las variantes del lote.
 */
export default class PricelistRecordsBatchService {
  private readonly logger = Logger.child({ service: 'PricelistRecordsBatchService' })

  constructor(private readonly bigcommerce: BigCommerceService) {}

  /**
   * Ejecutar una vez al inicio del sync (no-CL): GET todas las paginas de /pricelists/{id}/records.
   */
  async syncFullPricelistFromBigcommerce(priceListId: number): Promise<void> {
    this.logger.info({ priceListId }, 'Descargando price list completo desde BigCommerce...')
    const records = await this.bigcommerce.priceLists.getAll(priceListId)
    await this.persistRecords(records)
    this.logger.info(
      { priceListId, records: records.length },
      'Price list persistido en base local'
    )
  }

  /**
   * IDs de variante presentes en el price list del pais (para filtrar catalogo BC).
   */
  async getVariantIdsInPriceList(priceListId: number): Promise<Set<number>> {
    const rows = await PricelistVariantRecord.query()
      .where('price_list_id', priceListId)
      .select('variant_id')

    return new Set(rows.map((r) => r.variant_id))
  }

  /**
   * Para un lote: solo lectura local por variant_id (sin llamadas BC por lote).
   */
  async loadMapFromDbForVariantIds(
    priceListId: number,
    variantIds: number[]
  ): Promise<Map<number, PriceListRecord>> {
    const unique = [...new Set(variantIds)].filter((id) => Number.isFinite(id) && id > 0)
    if (unique.length === 0) {
      return new Map()
    }

    const rows = await PricelistVariantRecord.query()
      .where('price_list_id', priceListId)
      .whereIn('variant_id', unique)

    const map = new Map<number, PriceListRecord>()
    for (const row of rows) {
      map.set(row.variant_id, this.dbRowToPriceListRecord(row))
    }

    if (map.size < unique.length) {
      this.logger.warn(
        {
          priceListId,
          requested: unique.length,
          found: map.size,
        },
        'Algunas variantes del lote no tienen fila en pricelist_variant_records; revisar sync previo del price list'
      )
    }

    return map
  }

  private dbRowToPriceListRecord(row: PricelistVariantRecord): PriceListRecord {
    const sale = row.sale_price ?? row.calculated_price
    return {
      price_list_id: row.price_list_id,
      variant_id: row.variant_id,
      product_id: row.product_id,
      price: row.price,
      sale_price: sale,
      retail_price: row.retail_price ?? 0,
      map_price: row.map_price ?? 0,
      calculated_price: row.calculated_price,
      date_created: '',
      date_modified: row.bc_date_modified?.toISO() ?? '',
      currency: row.currency,
      bulk_pricing_tiers: [],
    }
  }

  private async persistRecords(records: PriceListRecord[]): Promise<void> {
    if (records.length === 0) return

    await db.transaction(async (trx) => {
      for (const r of records) {
        await PricelistVariantRecord.updateOrCreate(
          { price_list_id: r.price_list_id, variant_id: r.variant_id },
          {
            price_list_id: r.price_list_id,
            product_id: r.product_id,
            variant_id: r.variant_id,
            price: r.price,
            sale_price: r.sale_price ?? null,
            calculated_price: r.calculated_price,
            retail_price: r.retail_price ?? null,
            map_price: r.map_price ?? null,
            currency: r.currency,
            bc_date_modified: r.date_modified ? DateTime.fromISO(r.date_modified) : null,
          },
          { client: trx }
        )
      }
    })
  }
}
