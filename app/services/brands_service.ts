import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import Brand from '#models/brand'
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
    const brands = await Brand.all()
    return brands
  }

  /**
   * Obtiene una marca por ID
   */
  async getBrandById(id: number) {
    const brand = await Brand.findOrFail(id)
    return brand
  }

  /**
   * Crea una nueva marca
   */
  async createBrand(data: { id: number; name: string }) {
    const brand = await Brand.create(data)
    return brand
  }

  /**
   * Actualiza una marca existente
   */
  async updateBrand(id: number, data: { name?: string }) {
    const brand = await Brand.findOrFail(id)
    brand.merge(data)
    await brand.save()
    return brand
  }

  /**
   * Elimina una marca
   */
  async deleteBrand(id: number) {
    const brand = await Brand.findOrFail(id)
    await brand.delete()
    return { success: true, message: 'Marca eliminada correctamente' }
  }

  /**
   * Sincroniza las marcas desde BigCommerce
   */
  async syncBrands() {
    try {
      // Validar conexión con BigCommerce
      const brands = await this.bigCommerceService.getBrands()

      if (!brands || !Array.isArray(brands)) {
        throw new Error('Respuesta inválida de BigCommerce: no se recibieron marcas')
      }

      if (brands.length === 0) {
        return {
          success: true,
          message: 'No hay marcas para sincronizar',
          data: [],
          meta: {
            total: 0,
            created: 0,
            updated: 0,
            errors: 0,
            processed: 0,
          },
          errors: [],
        }
      }

      const results = {
        created: 0,
        updated: 0,
        errors: [] as Array<{ brand: any; error: string }>,
        processed: [] as any[],
      }

      // Procesar marcas de forma secuencial para mejor control de errores
      for (const brandData of brands) {
        try {
          // Validar datos de entrada
          if (!brandData.id || !brandData.name) {
            throw new Error(`Datos de marca inválidos: ID o nombre faltante`)
          }

          const searchPayload = { id: brandData.id }
          const persistancePayload = {
            id: brandData.id,
            name: brandData.name.trim(), // Limpiar espacios
          }

          // Crear o actualizar marca
          const existingBrand = await Brand.updateOrCreate(searchPayload, persistancePayload)

          if (existingBrand.$isNew) {
            results.created++
          } else {
            results.updated++
          }

          results.processed.push(existingBrand)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
          results.errors.push({ brand: brandData, error: errorMessage })

          // Clasificar tipo de error
          if (error instanceof Error) {
            if (error.message.includes('column') || error.message.includes('constraint')) {
              this.logger.error('Error de base de datos para marca', {
                brand_name: brandData.name,
                brand_id: brandData.id,
                error: error.message,
              })
            } else if (error.message.includes('timeout') || error.message.includes('network')) {
              this.logger.error('🌐 Error de conexión para marca', {
                brand_name: brandData.name,
                brand_id: brandData.id,
                error: error.message,
              })
            } else {
              this.logger.warn('Error al procesar marca', {
                brand_name: brandData.name,
                brand_id: brandData.id,
                error: error.message,
              })
            }
          }
        }
      }

      // Generar resumen de resultados
      const totalProcessed = results.created + results.updated + results.errors.length
      const hasErrors = results.errors.length > 0

      if (hasErrors) {
        this.logger.warn('Errores en sincronización de marcas', {
          created: results.created,
          updated: results.updated,
          errors: results.errors.length,
          total: brands.length,
        })
      }

      return {
        success: !hasErrors,
        message: hasErrors
          ? `Sincronización completada con ${results.errors.length} errores`
          : 'Marcas sincronizadas',
        data: results.processed,
        meta: {
          total: brands.length,
          created: results.created,
          updated: results.updated,
          errors: results.errors.length,
          processed: totalProcessed,
        },
        errors: hasErrors ? results.errors : [],
      }
    } catch (error) {
      this.logger.error('Error crítico en sincronización de marcas', {
        error: error.message,
      })

      // Clasificar error crítico
      let errorMessage = 'Error desconocido en sincronización'
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('ECONNREFUSED')) {
          errorMessage = 'Error de conexión con BigCommerce'
        } else if (error.message.includes('unauthorized') || error.message.includes('401')) {
          errorMessage = 'Error de autenticación con BigCommerce'
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = 'Límite de velocidad excedido en BigCommerce'
        } else {
          errorMessage = `Error en sincronización: ${error.message}`
        }
      }

      throw new Error(errorMessage)
    }
  }
}
