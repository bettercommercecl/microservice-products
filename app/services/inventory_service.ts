import env from '#start/env'
import axios from 'axios'
import Logger from '@adonisjs/core/services/logger'
import BigCommerceService from '#services/bigcommerce_service'
import CatalogSafeStock from '#models/catalog.safe.stock'
import db from '@adonisjs/lucid/services/db'
import { SafeStockItem } from '#interfaces/inventory_interface'

type FormattedInventoryItem = {
  sku: string
  variant_id: number
  product_id: number
  safety_stock: number
  warning_level: number
  available_to_sell: number
  bin_picking_number: string | number | null | undefined
}

export default class InventoryService {
  private bigCommerceService: BigCommerceService
  private readonly logger = Logger.child({ service: 'InventoryService' })

  constructor() {
    this.bigCommerceService = new BigCommerceService()
  }

  /**
   * Obtiene inventario por ID de variante desde microservicio externo
   */
  async getInventoryByVariantId(variant_id: number) {
    try {
      const locationId = env.get(`INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_INVENTORY')}/inventory/${variant_id}/${locationId}`
      const response = await axios.get(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })

      return response.data
    } catch (error) {
      this.logger.error('Error obteniendo inventario por variante', {
        variant_id,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Actualiza inventario de producto en microservicio externo
   */
  async updateInventory(product_id: number, quantity: number) {
    try {
      const locationId = env.get(`INVENTORY_LOCATION_ID_${env.get('COUNTRY_CODE')}`)
      const url = `${env.get('URL_MICROSERVICE_INVENTORY')}/inventory/${product_id}/${locationId}/${quantity}`
      const response = await axios.patch(url, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      })

      return response.data
    } catch (error) {
      this.logger.error('Error actualizando inventario', {
        product_id,
        quantity,
        error: error.message,
      })
      throw error
    }
  }

  /**
   * Sincroniza stock de seguridad desde BigCommerce
   * Responsabilidad: Gestionar todo lo relacionado con stock de seguridad
   */
  async syncSafeStock() {
    try {
      this.logger.info('Iniciando sincronización de stock de seguridad...')

      const productInventory = await this.bigCommerceService.getSafeStockGlobal()

      if (Array.isArray(productInventory)) {
        const formattedInventory = productInventory.map((item: SafeStockItem) => ({
          sku: item.identity.sku.trim(),
          variant_id: item.identity.variant_id,
          product_id: item.identity.product_id,
          safety_stock: item.settings.safety_stock,
          warning_level: item.settings.warning_level,
          available_to_sell: item.available_to_sell,
          bin_picking_number: item.settings.bin_picking_number,
        }))

        // Eliminar duplicados por SKU (mantener el último registro)
        const uniqueInventory = formattedInventory.reduce(
          (acc, current) => {
            acc[current.sku] = current
            return acc
          },
          {} as Record<string, any>
        )

        const deduplicatedInventory = Object.values(uniqueInventory)

        const result = await CatalogSafeStock.updateOrCreateMany(
          'variant_id',
          deduplicatedInventory
        )

        return {
          success: true,
          message: 'Stock de seguridad sincronizado correctamente',
          data: result,
          meta: {
            total: deduplicatedInventory.length,
            original: formattedInventory.length,
            duplicates: formattedInventory.length - deduplicatedInventory.length,
            timestamp: new Date().toISOString(),
          },
        }
      } else if (productInventory && productInventory.status === 'Error') {
        this.logger.error('Error en respuesta de BigCommerce para stock de seguridad')
        return productInventory
      }

      return {
        success: false,
        message: 'No se pudo obtener stock de seguridad de BigCommerce',
        data: null,
      }
    } catch (error) {
      this.logger.error('Error crítico al sincronizar stock de seguridad', {
        error: error.message,
      })
      return {
        status: 'Error',
        message: 'Error al sincronizar el stock de seguridad',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }
  async saveInventoryReserve() {
    try {
      const locationId =
        env.get('COUNTRY_CODE') === 'PE'
          ? env.get('INVENTORY_RESERVE_PE_ID')
          : env.get('INVENTORY_RESERVE_CO_ID')

      if (!locationId) {
        throw new Error('Location ID no está configurado en las variables de entorno')
      }

      this.logger.info('Iniciando sincronización de inventario de reserva...', {
        country: env.get('COUNTRY_CODE'),
        locationId,
      })

      let productInventory: any =
        await this.bigCommerceService.getInventoryGlobalReserve(locationId)

      if ('status' in productInventory && productInventory.status === 'Error') {
        this.logger.error('Error obteniendo inventario de reserva', productInventory)
        return productInventory
      }

      if (!Array.isArray(productInventory)) {
        return {
          status: 'Error',
          message: 'Respuesta inválida de BigCommerce para inventario de reserva',
        }
      }

      productInventory = productInventory.map(
        (item: SafeStockItem): FormattedInventoryItem => ({
          sku: item.identity.sku.trim(),
          variant_id: item.identity.variant_id,
          product_id: item.identity.product_id,
          safety_stock: item.settings.safety_stock,
          warning_level: item.settings.warning_level,
          available_to_sell: item.available_to_sell,
          bin_picking_number: item.settings.bin_picking_number,
        })
      )

      const productsReserve = productInventory.filter(
        (item: FormattedInventoryItem) =>
          typeof item.bin_picking_number === 'string' && item.bin_picking_number.trim().length > 0
      )

      if (productsReserve.length === 0) {
        this.logger.warn('No se encontraron productos con bin_picking_number válido')
        return {
          success: true,
          message: 'No hay productos de reserva para guardar',
          data: [],
        }
      }

      const result = await CatalogSafeStock.updateOrCreateMany('variant_id', productsReserve)

      this.logger.info('Inventario de reserva sincronizado correctamente', {
        total: productsReserve.length,
      })

      return {
        success: true,
        message: 'Inventario de reserva sincronizado correctamente',
        data: result,
        meta: {
          total: productsReserve.length,
          timestamp: new Date().toISOString(),
        },
      }
    } catch (error: any) {
      this.logger.error('Error durante la sincronización de inventario de reserva', {
        error: error.message,
        stack: error.stack,
      })
      return {
        status: 'Error',
        message: 'Error al intentar guardar el inventario de reserva',
        detail: error.message,
        stack: error.stack,
      }
    }
  }
  /**
   * Obtiene estadísticas de stock de seguridad
   */
  async getSafeStockStats() {
    try {
      const totalRecords = await CatalogSafeStock.query().count('* as total')
      const lowStock = await CatalogSafeStock.query()
        .where('available_to_sell', '<=', db.raw('warning_level'))
        .count('* as total')

      return {
        success: true,
        data: {
          total_records: Number(totalRecords[0].$extras.total),
          low_stock_items: Number(lowStock[0].$extras.total),
        },
      }
    } catch (error) {
      this.logger.error('Error obteniendo estadísticas de stock', {
        error: error.message,
      })
      throw error
    }
  }
}
