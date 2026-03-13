import BigCommerceService from '#infrastructure/bigcommerce/bigcommerce_api'
import { SafeStockItem } from '#interfaces/inventory_interface'
import CatalogSafeStock from '#models/catalog.safe.stock'
import InventoryReserve from '#models/inventory_reserve'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import { getReaderDb } from '#services/db_reader'
import axios from 'axios'
import { extractDbError } from '#utils/db_error_extractor'

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
        this.logger.error('Error en respuesta de BigCommerce para stock de seguridad', {
          code: productInventory.code,
          title: productInventory.title,
          detail: productInventory.detail,
          httpStatus: productInventory.httpStatus,
          endpoint: productInventory.endpoint,
          bcResponse: productInventory.bcResponse,
        })
        return productInventory
      }

      return {
        success: false,
        message: 'No se pudo obtener stock de seguridad de BigCommerce',
        data: null,
      }
    } catch (error: any) {
      const dbError = extractDbError(error)
      const axiosError = error?.response
        ? {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            url: error.config?.url,
          }
        : null

      this.logger.error('Error crítico al sincronizar stock de seguridad', {
        message: error instanceof Error ? error.message : 'Error desconocido',
        dbError: Object.keys(dbError).length > 0 ? dbError : undefined,
        axios: axiosError,
        stack: error?.stack,
      })

      return {
        status: 'Error',
        message: 'Error al sincronizar el stock de seguridad',
        error: error instanceof Error ? error.message : 'Error desconocido',
        dbError: dbError.code || dbError.detail ? dbError : undefined,
        httpStatus: axiosError?.status,
        bcResponse: axiosError?.data,
      }
    }
  }
  async saveInventoryReserve() {
    try {
      const locationId = env.get(`INVENTORY_RESERVE_ID_${env.get('COUNTRY_CODE')}`)

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
      const dbError = extractDbError(error)
      this.logger.error('Error durante la sincronización de inventario de reserva', {
        error: error.message,
        dbError: dbError.code ? dbError : undefined,
        stack: error.stack,
      })
      return {
        status: 'Error',
        message: 'Error al intentar guardar el inventario de reserva',
        detail: error.message,
        dbError: dbError.code ? dbError : undefined,
      }
    }
  }
  /**
   * Cruza inventario de reserva BC con reservas de n8n.
   * Solo los SKUs presentes en inventory_reserve (n8n) se guardan en catalog_safe_stock.
   * Los demas SKUs se limpian (bin_picking_number = '').
   * Si INVENTORY_RESERVE_ID_{COUNTRY_CODE} no esta configurado, se omite automaticamente.
   */
  async syncReserveWithN8nCrossRef(): Promise<{
    success: boolean
    message: string
    total: number
  }> {
    const locationId = env.get(`INVENTORY_RESERVE_ID_${env.get('COUNTRY_CODE')}`)

    if (!locationId) {
      this.logger.info('INVENTORY_RESERVE_ID no configurado para este pais, omitiendo cruce de reservas')
      return { success: true, message: 'Cruce de reservas no configurado para este pais', total: 0 }
    }

    this.logger.info({ locationId }, 'Iniciando cruce inventario reserva con n8n...')

    let productInventory: any =
      await this.bigCommerceService.getInventoryGlobalReserve(locationId)

    if (!Array.isArray(productInventory)) {
      throw new Error('Respuesta invalida de BigCommerce para inventario de reserva')
    }

    const formatted = productInventory.map((item: SafeStockItem) => ({
      sku: item.identity.sku.trim(),
      variant_id: item.identity.variant_id,
      product_id: item.identity.product_id,
      safety_stock: item.settings.safety_stock,
      warning_level: item.settings.warning_level,
      available_to_sell: item.available_to_sell,
      bin_picking_number: String(item.settings.bin_picking_number ?? ''),
    }))

    const allSkus = formatted.map((item) => item.sku)

    const reservedSkus = await InventoryReserve.query()
      .whereIn('sku', allSkus)
      .select('sku')
    const reservedSkuSet = new Set(reservedSkus.map((r) => r.sku))

    const productsInReserve = formatted.filter((item) => reservedSkuSet.has(item.sku))

    if (productsInReserve.length > 0) {
      await CatalogSafeStock.updateOrCreateMany('variant_id', productsInReserve)
    }

    const skusNotInReserve = allSkus.filter((sku) => !reservedSkuSet.has(sku))
    if (skusNotInReserve.length > 0) {
      await CatalogSafeStock.query()
        .whereIn('sku', skusNotInReserve)
        .update({ bin_picking_number: '' })
    }

    this.logger.info(
      { inReserve: productsInReserve.length, cleaned: skusNotInReserve.length },
      'Cruce inventario reserva completado'
    )

    return {
      success: true,
      message: `${productsInReserve.length} productos cruzados con n8n, ${skusNotInReserve.length} limpiados`,
      total: productsInReserve.length,
    }
  }

  /**
   * Obtiene estadísticas de stock de seguridad (usa replica de lectura si esta configurada).
   */
  async getSafeStockStats() {
    try {
      const reader = getReaderDb()
      const totalResult = await reader.from('catalog_safe_stocks').count('* as total').first()
      const lowStockResult = await reader
        .from('catalog_safe_stocks')
        .whereRaw('available_to_sell <= warning_level')
        .count('* as total')
        .first()

      return {
        success: true,
        data: {
          total_records: Number(totalResult?.total ?? 0),
          low_stock_items: Number(lowStockResult?.total ?? 0),
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
