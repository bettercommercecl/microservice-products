import type { AxiosInstance } from 'axios'
import type { Logger } from '@adonisjs/core/logger'

export interface ProductVariant {
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
}

export interface ProductOption {
  id: number
  display_name: string
  product_id: number
  option_values: Array<{
    id: number
    label: string
    value_data?: {
      colors?: any
      image_url?: string
    }
  }>
}

export default class VariantsApi {
  constructor(
    private readonly client: AxiosInstance,
    private readonly logger: Logger
  ) {}

  async getByProduct(productId: number): Promise<ProductVariant[]> {
    try {
      const response = await this.client.get(`/v3/catalog/products/${productId}/variants`, {
        timeout: 15_000,
      })
      return response.data.data
    } catch (error) {
      this.logger.error('Error al obtener variantes de producto', {
        product_id: productId,
        error: error.message,
      })
      throw new Error(
        `Error fetching product variants from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  async getOptionsByProduct(productId: number): Promise<ProductOption[]> {
    try {
      const response = await this.client.get(`/v3/catalog/products/${productId}/options`, {
        timeout: 15_000,
      })
      return response.data.data
    } catch (error) {
      this.logger.error('Error al obtener opciones de variantes', {
        product_id: productId,
        error: error.message,
      })
      throw new Error(
        `Error fetching product variant options from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Obtiene metafields de una variante por key.
   * Usado para packs: metafield key 'packs' contiene items del pack por variante.
   */
  async getMetafieldsByVariant(
    productId: number,
    variantId: number,
    key: string
  ): Promise<Array<{ key: string; value: string; namespace?: string }>> {
    try {
      const response = await this.client.get(
        `/v3/catalog/products/${productId}/variants/${variantId}/metafields`,
        {
          params: { key },
          timeout: 15_000,
        }
      )
      return response.data.data ?? []
    } catch (error: any) {
      this.logger.error('Error obteniendo metafields de variante', {
        product_id: productId,
        variant_id: variantId,
        key,
        error: error?.message ?? 'Unknown',
      })
      return []
    }
  }
}
