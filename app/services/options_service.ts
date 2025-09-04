import Logger from '@adonisjs/core/services/logger'
import OptionOfProducts from '#models/option'
// import { GeneralService } from '#services/general_service'

export default class OptionsService {
  private readonly logger = Logger.child({ service: 'OptionsService' })

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
