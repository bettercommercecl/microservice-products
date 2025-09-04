import Logger from '@adonisjs/core/services/logger'
import Channel from '#models/channel'
import ChannelProduct from '#models/channel_product'
import { channels as channelsConfig } from '../utils/channels/channels.js'
import db from '@adonisjs/lucid/services/db'
import { FormattedProductWithModelVariants } from '#interfaces/formatted_product.interface'

export default class ChannelsService {
  private readonly logger = Logger.child({ service: 'ChannelsService' })

  /**
   * Inicializa los canales desde la configuración
   */
  async initializeChannels(): Promise<void> {
    try {
      const results = {
        created: 0,
        updated: 0,
        errors: [] as string[],
      }

      // 🚀 Iterar sobre cada marca (UF, FC, AF, etc.)
      for (const [brandName, countries] of Object.entries(channelsConfig)) {
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
            } else {
              results.updated++
            }
          } catch (error) {
            const errorMsg = `Error procesando ${brandName}_${countryCode}: ${error.message}`
            results.errors.push(errorMsg)
            this.logger.error('❌ Error procesando canal', {
              brand: brandName,
              country: countryCode,
              error: error.message,
            })
          }
        }
      }

      if (results.errors.length > 0) {
        this.logger.warn('⚠️ Errores durante inicialización de canales', {
          errors_count: results.errors.length,
          created: results.created,
          updated: results.updated,
        })
      }
    } catch (error) {
      this.logger.error('❌ Error en inicialización de canales', {
        error: error.message,
      })
      throw error
    }
  }

  /**
   * 🔗 Sincroniza las relaciones producto-canal
   * Responsabilidad: Gestionar asociaciones entre productos y canales
   */
  async syncChannelByProduct(
    products: FormattedProductWithModelVariants[],
    channel_id: number,
    trx?: any
  ) {
    const useExternalTransaction = !!trx
    const transaction = trx || (await db.transaction())

    try {
      // Limpiar SOLO los registros del canal actual
      await ChannelProduct.query({ client: transaction }).where('channel_id', channel_id).delete()

      // Preparar datos de canales
      const productsList = products.map((product) => ({
        product_id: product.id,
        channel_id: channel_id,
      }))

      // Guardar nuevas relaciones
      await ChannelProduct.createMany(productsList, { client: transaction })

      // Solo hacer commit si es nuestra propia transacción
      if (!useExternalTransaction) {
        await transaction.commit()
      }

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
      // Solo hacer rollback si es nuestra propia transacción
      if (!useExternalTransaction) {
        await transaction.rollback()
      }

      this.logger.error('❌ Error al sincronizar canal', {
        channel_id,
        products_count: products.length,
        error: error.message,
      })
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
      this.logger.error('❌ Error al obtener estadísticas de canales', {
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Ejecuta todas las tareas de inicialización
   */
  async initialize(): Promise<void> {
    try {
      // Inicializar canales
      await this.initializeChannels()
    } catch (error) {
      this.logger.error('❌ Error en servicios de arranque', {
        error: error.message,
      })
      throw error
    }
  }
}
