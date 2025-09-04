import Logger from '@adonisjs/core/services/logger'
import Channel from '#models/channel'
import ChannelProduct from '#models/channel_product'
import { channels as channelsConfig } from '../utils/channels/channels.js'
import db from '@adonisjs/lucid/services/db'
import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'

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

export default class ChannelsService {
  private readonly logger = Logger.child({ service: 'ChannelsService' })

  /**
   * Inicializa los canales desde la configuración
   */
  async initializeChannels(): Promise<void> {
    this.logger.info('🚀 Inicializando canales desde configuración...')

    try {
      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
      }

      // 🚀 Iterar sobre cada marca (UF, FC, AF, etc.)
      for (const [brandName, countries] of Object.entries(channelsConfig)) {
        this.logger.info(`📦 Procesando marca: ${brandName}`)

        // 🚀 Iterar sobre cada país (CL, CO, PE)
        for (const [countryCode, config] of Object.entries(countries as Record<string, any>)) {
          try {
            const channelId = config.CHANNEL
            const channelName = `${brandName}_${countryCode}`

            // ✅ Usar updateOrCreate con el channel_id como id
            const channel = await Channel.updateOrCreate(
              { id: channelId }, // Buscar por id (que será el channel_id)
              {
                id: channelId, // El id será el channel_id
                name: channelName,
              }
            )

            if (channel.$isNew) {
              results.created++
              this.logger.info(`✅ Canal creado: ${channelName} (ID: ${channelId})`)
            } else {
              results.updated++
              this.logger.info(`🔄 Canal actualizado: ${channelName} (ID: ${channelId})`)
            }
          } catch (error) {
            const errorMsg = `Error procesando ${brandName}_${countryCode}: ${error.message}`
            results.errors.push(errorMsg)
            this.logger.error(`❌ ${errorMsg}`)
          }
        }
      }

      // ✅ Logging del resultado final
      this.logger.info(`✅ Inicialización de canales completada`)
      this.logger.info(
        `📊 Resultados: ${results.created} creados, ${results.updated} actualizados, ${results.errors.length} errores`
      )

      if (results.errors.length > 0) {
        this.logger.warn(
          `⚠️ Se encontraron ${results.errors.length} errores durante la inicialización`
        )
      }
    } catch (error) {
      this.logger.error('❌ Error en inicialización de canales:', error)
      throw error
    }
  }

  /**
   * 🔗 Sincroniza las relaciones producto-canal
   * Responsabilidad: Gestionar asociaciones entre productos y canales
   */
  async syncChannelByProduct(products: FormattedProductWithModelVariants[], channel_id: number) {
    const trx = await db.transaction()
    try {
      this.logger.info(`🔗 Sincronizando productos para canal ${channel_id}...`)

      // Limpiar SOLO los registros del canal actual
      await ChannelProduct.query({ client: trx }).where('channel_id', channel_id).delete()
      this.logger.info(`🧹 Limpiados registros existentes del canal ${channel_id}`)

      // Preparar datos de canales
      const productsList = products.map((product) => ({
        product_id: product.id,
        channel_id: channel_id,
      }))

      // Guardar nuevas relaciones
      await ChannelProduct.createMany(productsList, { client: trx })
      await trx.commit()

      this.logger.info(
        `✅ Sincronización de canal completada: ${productsList.length} productos asociados`
      )

      return {
        success: true,
        message: 'Canales sincronizados correctamente',
        total: productsList.length,
        meta: {
          channel_id,
          products_count: productsList.length,
          timestamp: new Date().toISOString(),
        },
      }
    } catch (error) {
      await trx.rollback()
      this.logger.error(`❌ Error al sincronizar canal ${channel_id}:`, error)
      return {
        success: false,
        message: 'Error al sincronizar canales',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * 📊 Obtiene estadísticas de canales
   */
  async getChannelStats() {
    try {
      const totalChannels = await Channel.query().count('* as total')
      const totalRelations = await ChannelProduct.query().count('* as total')

      return {
        success: true,
        data: {
          total_channels: Number(totalChannels[0].$extras.total),
          total_product_channel_relations: Number(totalRelations[0].$extras.total),
        },
      }
    } catch (error) {
      this.logger.error('❌ Error al obtener estadísticas de canales:', error)
      throw error
    }
  }

  /**
   * Ejecuta todas las tareas de inicialización
   */
  async initialize(): Promise<void> {
    this.logger.info('🚀 Iniciando servicios de arranque...')

    try {
      // Inicializar canales
      await this.initializeChannels()

      this.logger.info('✅ Servicios de arranque completados exitosamente')
    } catch (error) {
      this.logger.error('❌ Error en servicios de arranque:', error)
      throw error
    }
  }
}
