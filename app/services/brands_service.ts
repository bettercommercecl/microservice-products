import Brand from '#models/brand'
import BigCommerceService from '#services/bigcommerce_service'
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
   * Crea una nueva marca
   */
  async createBrand(data: { id: number; name: string }) {
    this.logger.info(`➕ Creando nueva marca: ${data.name}`)
    const brand = await Brand.create(data)
    this.logger.info(`✅ Marca creada exitosamente: ${brand.name} (ID: ${brand.id})`)
    return brand
  }

  /**
   * Actualiza una marca existente
   */
  async updateBrand(id: number, data: { name?: string }) {
    this.logger.info(`🔄 Actualizando marca ID: ${id}`)
    const brand = await Brand.findOrFail(id)
    brand.merge(data)
    await brand.save()
    this.logger.info(`✅ Marca actualizada exitosamente: ${brand.name}`)
    return brand
  }

  /**
   * Elimina una marca
   */
  async deleteBrand(id: number) {
    this.logger.info(`🗑️ Eliminando marca ID: ${id}`)
    const brand = await Brand.findOrFail(id)
    await brand.delete()
    this.logger.info(`✅ Marca eliminada exitosamente: ${brand.name}`)
    return { success: true, message: 'Marca eliminada exitosamente' }
  }

  /**
   * Sincroniza las marcas desde BigCommerce
   */
  async syncBrands() {
    try {
      this.logger.info('🔄 Iniciando sincronización de marcas desde BigCommerce...')

      // 🔍 Validar conexión con BigCommerce
      const brands = await this.bigCommerceService.getBrands()

      if (!brands || !Array.isArray(brands)) {
        throw new Error('Respuesta inválida de BigCommerce: no se recibieron marcas')
      }

      this.logger.info(`📊 Marcas obtenidas de BigCommerce: ${brands.length} marcas`)

      if (brands.length === 0) {
        this.logger.warn('⚠️ No se encontraron marcas en BigCommerce')
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

      // 🚀 Procesar marcas de forma secuencial para mejor control de errores
      for (const brandData of brands) {
        try {
          // ✅ Validar datos de entrada
          if (!brandData.id || !brandData.name) {
            throw new Error(`Datos de marca inválidos: ID o nombre faltante`)
          }

          const searchPayload = { id: brandData.id }
          const persistancePayload = {
            id: brandData.id,
            name: brandData.name.trim(), // Limpiar espacios
          }

          // 🔄 Crear o actualizar marca
          const existingBrand = await Brand.updateOrCreate(searchPayload, persistancePayload)

          if (existingBrand.$isNew) {
            results.created++
            this.logger.info(`✅ Marca creada: ${brandData.name} (ID: ${brandData.id})`)
          } else {
            results.updated++
            this.logger.info(`🔄 Marca actualizada: ${brandData.name} (ID: ${brandData.id})`)
          }

          results.processed.push(existingBrand)
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Error desconocido'
          results.errors.push({ brand: brandData, error: errorMessage })

          // 🔍 Clasificar tipo de error
          if (error instanceof Error) {
            if (error.message.includes('column') || error.message.includes('constraint')) {
              this.logger.error(`❌ Error de base de datos para marca ${brandData.name}:`, error)
            } else if (error.message.includes('timeout') || error.message.includes('network')) {
              this.logger.error(`🌐 Error de conexión para marca ${brandData.name}:`, error)
            } else {
              this.logger.warn(`⚠️ Error al procesar marca ${brandData.name}:`, error)
            }
          }
        }
      }

      // 📊 Generar resumen de resultados
      const totalProcessed = results.created + results.updated + results.errors.length
      const hasErrors = results.errors.length > 0

      this.logger.info(
        `📊 Sincronización completada: ${results.created} creadas, ${results.updated} actualizadas, ${results.errors.length} errores`
      )

      return {
        success: !hasErrors,
        message: hasErrors
          ? `Sincronización completada con ${results.errors.length} errores`
          : 'Marcas sincronizadas exitosamente',
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
      this.logger.error('❌ Error crítico en sincronización de marcas:', error)

      // 🔍 Clasificar error crítico
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
