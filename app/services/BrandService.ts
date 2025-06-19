import Brand from '../models/Brand.js'
import BigCommerceService from './BigCommerceService.js'

export default class BrandService {
  private bigCommerceService: BigCommerceService

  constructor() {
    this.bigCommerceService = new BigCommerceService()
  }
  /**
   * Obtiene todas las marcas
   */
  async getAllBrands() {
    return await Brand.all()
  }

  /**
   * Obtiene una marca por ID
   */
  async getBrandById(id: number) {
    return await Brand.findOrFail(id)
  }

  /**
   * Sincroniza las marcas desde BigCommerce
   */
  async syncBrands() {
    try {
      const brands = await this.bigCommerceService.getBrands()
      
      const results = await Promise.all(
        brands.map(async (brandData: any) => {
          const searchPayload = { id: brandData.id }
          
          const persistancePayload = {
            id: brandData.id,
            name: brandData.name
          }

          try {
            // Intentar crear o actualizar la marca
            const existingBrand = await Brand.updateOrCreate(searchPayload, persistancePayload)
            return existingBrand
          } catch (error) {
            // Si hay un error de base de datos, lo propagamos
            if (error instanceof Error && error.message.includes('column')) {
              throw error
            }
            return {
              error: true,
              message: error instanceof Error ? error.message : 'Error desconocido',
              data: brandData
            }
          }
        })
      )

      // Verificar si hay errores en los resultados
      const hasErrors = results.some(result => result && 'error' in result && result.error)
      if (hasErrors) {
        return {
          success: false,
          message: 'Algunas marcas no pudieron ser sincronizadas',
          data: results
        }
      }

      return {
        success: true,
        message: 'Marcas sincronizadas exitosamente',
        data: results
      }
    } catch (error) {
      throw new Error(`Error sincronizando marcas desde Bigcommerce: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
} 