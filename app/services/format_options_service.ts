import Logger from '@adonisjs/core/services/logger'
import BigCommerceService from './bigcommerce_service.js'
import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'

/**
 * 🔧 Interfaz para opciones formateadas listas para guardar en la DB
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
   * 🔧 Formatea opciones para múltiples productos por lotes
   * @param products - Array de productos con variantes formateadas
   * @returns Array plano de opciones listas para guardar
   */
  async formatOptions(products: FormattedProductWithModelVariants[]): Promise<FormattedOption[]> {
    this.logger.info(`🔧 Formateando opciones para ${products.length} productos...`)

    if (products.length === 0) {
      return []
    }

    // 🚀 OPTIMIZACIÓN EXTREMA: Procesamiento paralelo masivo
    try {
      // 📊 Obtener IDs de productos únicos para evitar duplicados
      const uniqueProductIds = [...new Set(products.map((p) => p.product_id))]

      this.logger.info(
        `🚀 Obteniendo opciones para ${uniqueProductIds.length} productos únicos en paralelo...`
      )

      // 🔥 Procesar todos los productos en paralelo (máximo rendimiento)
      const productPromises = uniqueProductIds.map(async (productId) => {
        try {
          const productOptions = await this.formatOptionsByProduct(productId)
          return productOptions
        } catch (error) {
          this.logger.warn(`📭 Sin opciones para producto ${productId}`)
          return []
        }
      })

      // 🚀 Ejecutar todas las promesas en paralelo
      const allResults = await Promise.all(productPromises)
      const allOptions = allResults.flat()

      this.logger.info(
        `✅ Opciones formateadas: ${allOptions.length} registros para ${uniqueProductIds.length} productos únicos`
      )

      return allOptions
    } catch (error) {
      this.logger.warn(`⚠️ Error en procesamiento paralelo, usando método individual:`, error)

      // 🔄 FALLBACK: Método individual si falla el procesamiento paralelo
      return this.formatOptionsIndividual(products)
    }
  }

  // 🔄 Método de respaldo para procesamiento individual
  private async formatOptionsIndividual(
    products: FormattedProductWithModelVariants[]
  ): Promise<FormattedOption[]> {
    this.logger.info(`🔄 Usando procesamiento individual para ${products.length} productos...`)

    // 🚀 Procesar en lotes paralelos más pequeños
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
            this.logger.warn(`📭 Sin opciones para producto ${product.product_id}`)
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
   * 🔧 Formatea opciones para un producto específico
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
        `📭 Error obteniendo opciones para producto ${productId} - usando valores por defecto`
      )
      return []
    }
  }
  /**
   * 🔧 Formatea valores de las opciones del producto
   * @param options - Array de opciones de Bigcommerce
   * @returns Array de opciones formateadas
   */
  private async getOptionsValues(options: any[]): Promise<any[]> {
    if (!Array.isArray(options) || options.length === 0) {
      return []
    }

    return options.map((elem) => {
      const valueData = elem.value_data?.colors
        ? elem.value_data.colors
        : elem.value_data?.image_url

      return {
        id: elem.id,
        label: elem.label,
        value_data: valueData,
      }
    })
  }
}
