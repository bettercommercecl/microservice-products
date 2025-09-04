import Logger from '@adonisjs/core/services/logger'
import OptionOfProducts from '#models/option'
// import { GeneralService } from '#services/general_service'
import pLimit from 'p-limit'

// ✅ INTERFACES PARA TIPADO FUERTE
interface BigCommerceProduct {
  id: number
  product_id: number
  categories: number[]
  name: string
  description: string
  brand_id: number
  price: number
  sale_price: number
  inventory_level: number
  quantity: number
  weight: number
  width: number
  depth: number
  height: number
  sort_order: number
  is_featured: boolean
  is_visible: boolean
  meta_keywords?: string[]
  meta_description?: string
  custom_url?: {
    url: string
  }
  images: Array<{
    is_thumbnail: boolean
    url_standard: string
    url_zoom: string
    description: string
    sort_order: number
  }>
  variants: Array<{
    id: number
    sku: string
    price: number
    sale_price: number | null
    calculated_price: number
    inventory_level: number
    calculated_weight: number
    width: number
    depth: number
    height: number
    image_url: string
    option_values: any[]
    value_id: number
  }>
}

// Utilidad para serializar campos JSON
function toJsonField(value: any) {
  if (value === null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

export default class OptionsService {
  private readonly logger = Logger.child({ service: 'OptionsService' })

  /**
   * 🔧 Sincroniza las opciones por producto
   * Responsabilidad: Gestionar opciones y sus variantes
   */
  // async syncOptionsByProduct(products: BigCommerceProduct[]) {
  //   this.logger.info('🔧 Iniciando sincronización de opciones...')
  //   const failedOptions: any[] = []
  //   const batchSize = 10 // Procesar solo 10 productos a la vez
  //   const limit = pLimit(4) // Máximo 4 productos concurrentes

  //   try {
  //     console.time('Procesamiento total de opciones')

  //     // Procesar productos en batches pequeños
  //     for (let i = 0; i < products.length; i += batchSize) {
  //       const batch = products.slice(i, i + batchSize)
  //       this.logger.info(
  //         `📦 Procesando batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} (${batch.length} productos)`
  //       )

  //       await Promise.all(
  //         batch.map((product) =>
  //           limit(async () => {
  //             try {
  //               console.time(`Producto ${product.id} - formatOptionsByVariantByProduct`)
  //               const options = await GeneralService.formatOptionsByVariantByProduct(product as any)
  //               console.timeEnd(`Producto ${product.id} - formatOptionsByVariantByProduct`)

  //               if (!Array.isArray(options) || options.length === 0) {
  //                 this.logger.info(`⚠️ Producto ${product.id} - Sin opciones`)
  //                 return
  //               }

  //               // Eliminar opciones anteriores SOLO del producto actual
  //               console.time(`Producto ${product.id} - eliminar opciones anteriores`)
  //               await OptionOfProducts.query().where('product_id', product.id).delete()
  //               console.timeEnd(`Producto ${product.id} - eliminar opciones anteriores`)

  //               // Crear nuevas opciones
  //               console.time(`Producto ${product.id} - crear nuevas opciones`)
  //               await Promise.all(
  //                 options.map(async (option) => {
  //                   try {
  //                     const formattedOptions = option.options.map((opt: any) => ({
  //                       id: opt.id,
  //                       label: opt.label,
  //                       value: opt.value_data || '',
  //                     }))

  //                     await OptionOfProducts.create({
  //                       label: option.label,
  //                       product_id: option.product_id,
  //                       option_id: option.id,
  //                       options: toJsonField(formattedOptions),
  //                     })
  //                   } catch (error) {
  //                     failedOptions.push({
  //                       product_id: product.id,
  //                       option_id: option.id,
  //                       error: error instanceof Error ? error.message : 'Error desconocido',
  //                     })
  //                   }
  //                 })
  //               )
  //               console.timeEnd(`Producto ${product.id} - crear nuevas opciones`)
  //               this.logger.info(`✅ Guardadas opciones para producto ${product.id} en options`)
  //             } catch (error) {
  //               this.logger.error(
  //                 `❌ Error procesando producto ${product.id}:`,
  //                 error instanceof Error ? error.message : 'Error desconocido'
  //               )
  //               failedOptions.push({
  //                 product_id: product.id,
  //                 error: error instanceof Error ? error.message : 'Error desconocido',
  //               })
  //             }
  //           })
  //         )
  //       )
  //     }

  //     console.timeEnd('Procesamiento total de opciones')

  //     this.logger.info(`📊 Sincronización de opciones completada: ${failedOptions.length} errores`)

  //     return {
  //       success: failedOptions.length === 0,
  //       message:
  //         failedOptions.length > 0
  //           ? `Algunas opciones no se sincronizaron correctamente (${failedOptions.length} errores)`
  //           : 'Opciones sincronizadas correctamente',
  //       failed: failedOptions,
  //       meta: {
  //         total_products: products.length,
  //         failed_count: failedOptions.length,
  //         timestamp: new Date().toISOString(),
  //       },
  //     }
  //   } catch (error) {
  //     this.logger.error('❌ Error general en sincronización de opciones:', error)
  //     return {
  //       success: false,
  //       message: 'Error al sincronizar opciones',
  //       error: error instanceof Error ? error.message : 'Error desconocido',
  //     }
  //   }
  // }

  /**
   * 📊 Obtiene estadísticas de opciones
   */
  async getOptionsStats() {
    try {
      const totalOptions = await OptionOfProducts.query().count('* as total')
      const optionsByProduct = await OptionOfProducts.query()
        .select('product_id')
        .count('* as total')
        .groupBy('product_id')
        .orderBy('total', 'desc')
        .limit(10)

      return {
        success: true,
        data: {
          total_options: Number(totalOptions[0].$extras.total),
          top_products_with_options: optionsByProduct.map((opt) => ({
            product_id: opt.product_id,
            options_count: Number(opt.$extras.total),
          })),
        },
      }
    } catch (error) {
      this.logger.error('❌ Error al obtener estadísticas de opciones:', error)
      throw error
    }
  }

  /**
   * 🔍 Obtiene opciones por producto
   */
  async getOptionsByProduct(productId: number) {
    try {
      const options = await OptionOfProducts.query().where('product_id', productId)

      return {
        success: true,
        data: options,
        meta: {
          product_id: productId,
          total_options: options.length,
        },
      }
    } catch (error) {
      this.logger.error(`❌ Error al obtener opciones del producto ${productId}:`, error)
      throw error
    }
  }
}
