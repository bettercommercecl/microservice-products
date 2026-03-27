import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'
import Option from '#models/option'
import Logger from '@adonisjs/core/services/logger'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import pLimit from 'p-limit'
import BigCommerceService from '../infrastructure/bigcommerce/bigcommerce_api.js'

/**
 * Interfaz para opciones formateadas listas para guardar en la DB
 */
export interface FormattedOption {
  option_id: number
  product_id: number
  label: string
  options: string // JSON stringified
}

export default class FormatOptionsService {
  private readonly logger = Logger.child({ service: 'FormatOptionsService' })
  private readonly bigcommerceService: BigCommerceService
  constructor() {
    this.bigcommerceService = new BigCommerceService()
  }

  /**
   * Formatea opciones para múltiples productos por lotes
   * @param products - Array de productos con variantes formateadas
   * @returns Array plano de opciones listas para guardar
   */
  async formatOptions(products: FormattedProductWithModelVariants[]): Promise<FormattedOption[]> {
    if (products.length === 0) {
      return []
    }

    // OPTIMIZACIÓN EXTREMA: Procesamiento paralelo masivo
    try {
      // Obtener IDs de productos únicos para evitar duplicados
      const uniqueProductIds = [...new Set(products.map((p) => p.product_id))]

      // 🔥 Procesar todos los productos en paralelo (máximo rendimiento)
      const productPromises = uniqueProductIds.map(async (productId) => {
        try {
          const productOptions = await this.formatOptionsByProduct(productId)
          return productOptions
        } catch (error) {
          this.logger.warn({ product_id: productId }, 'Sin opciones para producto')
          return []
        }
      })

      // Ejecutar todas las promesas en paralelo
      const allResults = await Promise.all(productPromises)
      const allOptions = allResults.flat()

      return allOptions
    } catch (error) {
      this.logger.warn(
        {
          error: error.message,
        },
        'Error en procesamiento paralelo, usando método individual'
      )

      // FALLBACK: Método individual si falla el procesamiento paralelo
      return this.formatOptionsIndividual(products)
    }
  }

  // Método de respaldo para procesamiento individual
  private async formatOptionsIndividual(
    products: FormattedProductWithModelVariants[]
  ): Promise<FormattedOption[]> {
    // Procesar en lotes paralelos más pequeños
    const BATCH_SIZE = 50
    const batches = []

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      batches.push(products.slice(i, i + BATCH_SIZE))
    }

    const batchResults = await Promise.all(
      batches.map(async (batch) => {
        const productPromises = batch.map(async (product) => {
          try {
            return await this.formatOptionsByProduct(product.product_id)
          } catch (error) {
            this.logger.warn({ product_id: product.product_id }, 'Sin opciones para producto')
            return []
          }
        })

        const results = await Promise.all(productPromises)
        return results.flat()
      })
    )

    return batchResults.flat()
  }

  /**
   * Sincroniza opciones de productos por lotes: formatea y persiste con Option.updateOrCreateMany.
   */
  async syncOptionsForProducts(
    productsWithVariants: FormattedProductWithModelVariants[],
    trx?: QueryClientContract
  ): Promise<void> {
    this.logger.info(
      `Iniciando sincronización de opciones para ${productsWithVariants.length} productos...`
    )

    const BATCH_SIZE = 500
    const batches: FormattedProductWithModelVariants[][] = []
    for (let i = 0; i < productsWithVariants.length; i += BATCH_SIZE) {
      batches.push(productsWithVariants.slice(i, i + BATCH_SIZE))
    }

    this.logger.info(`Procesando ${batches.length} lotes de opciones en paralelo...`)

    const limit = pLimit(12)
    const batchResults = await Promise.all(
      batches.map((batch, batchIndex) =>
        limit(async () => {
          try {
            const batchOptions = await this.formatOptions(batch)
            if (batchOptions.length === 0) {
              return { processed: 0, batch: batchIndex + 1 }
            }
            await Option.updateOrCreateMany(
              ['option_id', 'product_id'],
              batchOptions,
              trx ? { client: trx } : undefined
            )
            this.logger.info(`Lote ${batchIndex + 1}: ${batchOptions.length} opciones guardadas`)
            return { processed: batchOptions.length, batch: batchIndex + 1 }
          } catch (error) {
            this.logger.error({ error }, `Error en lote ${batchIndex + 1}`)
            return { processed: 0, batch: batchIndex + 1, error: (error as Error).message }
          }
        })
      )
    )

    const totalProcessed = batchResults.reduce((sum, result) => sum + result.processed, 0)
    const errors = batchResults.filter((r) => (r as { error?: string }).error)
    this.logger.info(`Sincronización de opciones completada: ${totalProcessed} registros guardados`)
    if (errors.length > 0) {
      this.logger.warn(`${errors.length} lotes tuvieron errores`)
    }
  }

  /**
   * Formatea opciones para un producto específico
   * @param productId - ID del producto
   * @returns Array de opciones formateadas para el producto
   */
  private async formatOptionsByProduct(productId: number): Promise<FormattedOption[]> {
    try {
      const data = await this.bigcommerceService.getVariantsOptionsOfProduct(productId)

      // Verificar si data está vacío
      if (!data || data.length === 0) {
        return []
      }

      const productOptions: FormattedOption[] = []

      await Promise.all(
        data.map(async (elem) => {
          const options = await this.getOptionsValues(elem.option_values)
          const finalOptions = options.sort((a, b) => a.id - b.id)

          const formattedOption: FormattedOption = {
            option_id: elem.id,
            product_id: elem.product_id,
            label: elem.display_name,
            options: JSON.stringify(finalOptions), // JSON stringify para guardar en DB
          }

          productOptions.push(formattedOption)
        })
      )

      return productOptions
    } catch (error) {
      this.logger.warn(
        {
          product_id: productId,
          error: error.message,
        },
        'Error obteniendo opciones para producto'
      )
      return []
    }
  }
  /**
   * URLs (https) se guardan como string; colores u otros valores no URL van en array, ej. ["#334FF"].
   */
  private normalizeValueDataForStorage(raw: unknown): string | string[] {
    if (raw == null) return []

    if (typeof raw === 'string') {
      const t = raw.trim()
      if (t === '') return []
      return t.includes('https://') ? t : [t]
    }

    if (Array.isArray(raw)) {
      const strings = raw
        .map((x) => (typeof x === 'string' ? x.trim() : x != null ? String(x) : ''))
        .filter((s) => s.length > 0)
      if (strings.length === 0) return []
      if (strings.length === 1 && strings[0].includes('https://')) return strings[0]
      return strings
    }

    return [String(raw)]
  }

  /**
   * Formatea valores de las opciones del producto
   * @param options - Array de opciones de Bigcommerce
   * @returns Array de opciones formateadas
   */
  private async getOptionsValues(options: any[]): Promise<any[]> {
    if (!Array.isArray(options) || options.length === 0) {
      return []
    }

    return options.map((elem) => {
      const raw = elem.value_data?.colors
        ? elem.value_data.colors
        : elem.value_data?.image_url

      return {
        id: elem.id,
        label: elem.label,
        value_data: this.normalizeValueDataForStorage(raw),
      }
    })
  }
}
