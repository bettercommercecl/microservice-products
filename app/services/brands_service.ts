import Brand from '../models/brand.js'
import BigCommerceService from './bigcommerce_service.js'
import Logger from '@adonisjs/core/services/logger'

export default class BrandService {
  private bigCommerceService: BigCommerceService
  private readonly logger = Logger.child({ service: 'BrandService' })

  constructor() {
    this.bigCommerceService = new BigCommerceService()
  }
  /**
   * Obtiene todas las marcas
   */
  async getAllBrands() {
    this.logger.info('🏷️ Obteniendo todas las marcas de la base de datos...')
    const brands = await Brand.all()
    this.logger.info(`✅ Marcas obtenidas exitosamente: ${brands.length} marcas`)
    return brands
  }

  /**
   * Obtiene una marca por ID
   */
  async getBrandById(id: number) {
    this.logger.info(`🔍 Obteniendo marca por ID: ${id}`)
    const brand = await Brand.findOrFail(id)
    this.logger.info(`✅ Marca obtenida exitosamente: ${brand.name}`)
    return brand
  }

  /**
   * Sincroniza las marcas desde BigCommerce
   */
  async syncBrands() {
    try {
      this.logger.info('🔄 Iniciando sincronización de marcas desde BigCommerce...')

      const brands = await this.bigCommerceService.getBrands()
      this.logger.info(`📊 Marcas obtenidas de BigCommerce: ${brands.length} marcas`)

      const results = await Promise.all(
        brands.map(async (brandData: any) => {
          const searchPayload = { id: brandData.id }

          const persistancePayload = {
            id: brandData.id,
            name: brandData.name,
          }

          try {
            // Intentar crear o actualizar la marca
            const existingBrand = await Brand.updateOrCreate(searchPayload, persistancePayload)
            this.logger.info(`✅ Marca sincronizada: ${brandData.name} (ID: ${brandData.id})`)
            return existingBrand
          } catch (error) {
            // Si hay un error de base de datos, lo propagamos
            if (error instanceof Error && error.message.includes('column')) {
              this.logger.error(`❌ Error de base de datos para marca ${brandData.name}:`, error)
              throw error
            }
            this.logger.warn(`⚠️ Error al sincronizar marca ${brandData.name}:`, error)
            return {
              error: true,
              message: error instanceof Error ? error.message : 'Error desconocido',
              data: brandData,
            }
          }
        })
      )

      // Verificar si hay errores en los resultados
      const hasErrors = results.some((result) => result && 'error' in result && result.error)
      if (hasErrors) {
        this.logger.warn('⚠️ Algunas marcas no pudieron ser sincronizadas')
        return {
          success: false,
          message: 'Algunas marcas no pudieron ser sincronizadas',
          data: results,
        }
      }

      this.logger.info(
        `🎉 Sincronización de marcas completada exitosamente: ${results.length} marcas procesadas`
      )
      return {
        success: true,
        message: 'Marcas sincronizadas exitosamente',
        data: results,
      }
    } catch (error) {
      this.logger.error('❌ Error general en sincronización de marcas:', error)
      throw new Error(
        `Error sincronizando marcas desde Bigcommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }
}
