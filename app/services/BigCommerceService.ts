import axios from 'axios'
import env from '#start/env'
import { PARENT } from '../constants/brands.js'

interface ProductVariant {
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

interface ProductOption {
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

interface ChannelProduct {
  product_id: number
  channel_id: number
}

interface SafeStockItem {
  identity: {
    sku: string
    variant_id: number
    product_id: number
  }
  settings: {
    safety_stock: number
    warning_level: number
    bin_picking_number: string
  }
  available_to_sell: number
}

export default class BigCommerceService {
  private baseUrl: string
  private headers: Record<string, string>

  constructor() {
    this.baseUrl = `${env.get('BIGCOMMERCE_API_URL') || ''}${env.get('BIGCOMMERCE_API_STORE_ID') || ''}`
    this.headers = {
      'X-Auth-Token': env.get('BIGCOMMERCE_API_TOKEN') || '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'host': 'api.bigcommerce.com'
    }
  }

  /**
   * Obtiene todas las marcas de BigCommerce
   * @param ids Array opcional de IDs específicos de marcas
   * @returns Array de marcas de BigCommerce
   */
  async getBrands(ids: number[] = []) {
    try {
      const urlEndpoint = ids.length > 0 
        ? `${this.baseUrl}/v3/catalog/brands?id:in=${ids.join(',')}`
        : `${this.baseUrl}/v3/catalog/brands?limit=200`

      const response = await axios.get(urlEndpoint, {
        headers: this.headers,
        timeout: 15000
      })
      return response.data.data

    } catch (error) {
      throw new Error(`Error fetching brands from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obtiene todas las categorías de BigCommerce con paginación
   */
  async getCategories() {
    try {
      const allCategories = []
      let currentPage = 1
      let totalPages = 1

      // Realiza solicitudes secuenciales hasta que se recuperen todas las páginas
      while (currentPage <= totalPages) {
        const results = await axios.get(`${this.baseUrl}/v3/catalog/trees/categories`, {
          headers: this.headers,
          params: {
            limit: 250,
            page: currentPage,
          },
          timeout: 15000
        })

        const { data, meta } = results.data
        allCategories.push(...data)

        // Actualiza el número total de páginas
        totalPages = meta.pagination.total_pages

        currentPage++
      }

      return allCategories
    } catch (error) {
      console.error('Error al obtener las categorías:', error)
      throw new Error(`Error al obtener las categorías: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obtiene todos los productos de BigCommerce
   */
  async getProducts() {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/catalog/products`, {
        headers: this.headers,
        timeout: 15000
      })
      return response.data.data
    } catch (error) {
      throw new Error(`Error fetching products from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obtiene un producto específico de BigCommerce por ID
   */
  async getProductById(id: number) {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/catalog/products/${id}`, {
        headers: this.headers,
        timeout: 15000
      })
      return response.data.data
    } catch (error) {
      throw new Error(`Error fetching product from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obtiene las opciones de variantes de un producto específico
   */
  async getVariantsOptionsOfProduct(productId: number): Promise<ProductOption[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/catalog/products/${productId}/options`, {
        headers: this.headers,
        timeout: 15000
      })
      return response.data.data
    } catch (error) {
      throw new Error(`Error fetching product variant options from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obtiene las variantes de un producto específico
   */
  async getVariantsOfProduct(productId: number): Promise<ProductVariant[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/catalog/products/${productId}/variants`, {
        headers: this.headers,
        timeout: 15000
      })
      return response.data.data
    } catch (error) {
      throw new Error(`Error fetching product variants from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Obtiene los productos por canal
   */

  //obtener productos por canal
  async getProductsByChannel(channel : number, page = 1, limit = 2000) {
    const options = {
      method: 'GET',
      url:
        this.baseUrl + 
        `/v3/catalog/products/channel-assignments?channel_id:in=${channel}&limit=${limit}&page=${page}`,
      headers: this.headers
    }

    try {
      const response = await axios.request({
        ...options,
        timeout: 15000
      })
      return response.data
    } catch (error) {
      return { status: error.response.status, message: error.response.statusText }
    }
  }

  /**
   * Obtiene productos detallados por IDs
   */
  async getAllProductsRefactoring(products: number[], visible = 1, limit = 2000, channel : number) {
    // Aseguramos que channel es uno de los índices válidos de PARENT
    let parent_id : any = PARENT[channel as keyof typeof PARENT]

    if (!parent_id === undefined) {
      return { error: 'Canal no válido' }
}
    const baseUrl = this.baseUrl + '/v3/catalog/products'
    const visibilityParam = visible == 1 ? 'is_visible=1&' : ''
    const categoriesParam = parent_id == 0 ? '' : `&categories:in=${parent_id}`
    const commonParams = `id:in=${products}&availability=available&sort=id&direction=desc&include=images,variants&limit=${limit}${categoriesParam}`
    const url = `${baseUrl}?${visibilityParam}${commonParams}`
    try {
      const { data } = await axios.get(url, { headers: this.headers, timeout: 15000 })
      return data
    } catch (error) {
      throw error
    }
  }

  /**
   * Obtiene el stock de seguridad global
   */
  async getSafeStockGlobal(page = 1) {
    try {
      const endpoint = `${this.baseUrl}/v3/inventory/locations/${env.get('INVENTORY_LOCATION_ID')}/items?page=`

      const firstPageResponse = await axios.get(endpoint + page, { headers: this.headers })
      const totalPages = firstPageResponse.data.meta.pagination.total_pages
      const pagesToFetch = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)

      const pagesData = await Promise.all(
        pagesToFetch.map(page => axios.get(endpoint + page, { headers: this.headers }).then(response => response.data.data))
      )
      const inventory = [...firstPageResponse.data.data, ...pagesData.flat()]

      return inventory
    } catch (error: any) {
      console.log(error)
      return {
        status: 'Error',
        message: 'Error al intentar obtener el stock de seguridad de bigcommerce',
        code: error.message,
        title: error.response?.data?.title,
      }
    }
  }
} 