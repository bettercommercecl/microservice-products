import axios from 'axios'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'

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

export default class BigCommerceService {
  private baseUrl: string
  private headers: Record<string, string>
  private readonly logger = Logger.child({ service: 'BigCommerceService' })

  constructor() {
    this.baseUrl = `${env.get('BIGCOMMERCE_API_URL') || ''}${env.get('BIGCOMMERCE_API_STORE_ID') || ''}`
    this.headers = {
      'X-Auth-Token': env.get('BIGCOMMERCE_API_TOKEN') || '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'host': 'api.bigcommerce.com',
    }
  }

  /**
   * Obtiene todas las marcas de BigCommerce
   * @param ids Array opcional de IDs específicos de marcas
   * @returns Array de marcas de BigCommerce
   */
  async getBrands(ids: number[] = []) {
    try {
      const urlEndpoint =
        ids.length > 0
          ? `${this.baseUrl}/v3/catalog/brands?id:in=${ids.join(',')}`
          : `${this.baseUrl}/v3/catalog/brands?limit=200`

      const response = await axios.get(urlEndpoint, {
        headers: this.headers,
        timeout: 15000,
      })

      return response.data.data
    } catch (error) {
      this.logger.error('❌ Error al obtener marcas de BigCommerce', {
        ids_count: ids.length,
        error: error.message,
      })
      throw new Error(
        `Error fetching brands from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
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
          timeout: 15000,
        })

        const { data, meta } = results.data
        allCategories.push(...data)

        // Actualiza el número total de páginas
        totalPages = meta.pagination.total_pages

        currentPage++
      }

      return allCategories
    } catch (error) {
      this.logger.error('❌ Error al obtener las categorías de BigCommerce', {
        error: error.message,
      })
      throw new Error(
        `Error al obtener las categorías: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Obtiene todos los productos de BigCommerce
   */
  async getProducts() {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/catalog/products`, {
        headers: this.headers,
        timeout: 15000,
      })

      return response.data.data
    } catch (error) {
      this.logger.error('❌ Error al obtener productos de BigCommerce', {
        error: error.message,
      })
      throw new Error(
        `Error fetching products from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Obtiene un producto específico de BigCommerce por ID
   */
  async getProductById(id: number) {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/catalog/products/${id}`, {
        headers: this.headers,
        timeout: 15000,
      })
      return response.data.data
    } catch (error) {
      this.logger.error('❌ Error al obtener producto de BigCommerce', {
        product_id: id,
        error: error.message,
      })
      throw new Error(
        `Error fetching product from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Obtiene las opciones de variantes de un producto específico
   */
  async getVariantsOptionsOfProduct(productId: number): Promise<ProductOption[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/v3/catalog/products/${productId}/options`, {
        headers: this.headers,
        timeout: 15000,
      })
      return response.data.data
    } catch (error) {
      this.logger.error('❌ Error al obtener opciones de variantes', {
        product_id: productId,
        error: error.message,
      })
      throw new Error(
        `Error fetching product variant options from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Obtiene las variantes de un producto específico
   */
  async getVariantsOfProduct(productId: number): Promise<ProductVariant[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/v3/catalog/products/${productId}/variants`,
        {
          headers: this.headers,
          timeout: 15000,
        }
      )
      return response.data.data
    } catch (error) {
      this.logger.error('❌ Error al obtener variantes de producto', {
        product_id: productId,
        error: error.message,
      })
      throw new Error(
        `Error fetching product variants from BigCommerce: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Obtiene los productos por canal
   */

  //obtener productos por canal
  async getProductsByChannel(channel: number, page = 1, limit = 2000) {
    const options = {
      method: 'GET',
      url:
        this.baseUrl +
        `/v3/catalog/products/channel-assignments?channel_id:in=${channel}&limit=${limit}&page=${page}`,
      headers: this.headers,
    }

    try {
      const response = await axios.request({
        ...options,
        timeout: 15000,
      })
      return response.data
    } catch (error) {
      this.logger.error('❌ Error al obtener productos por canal', {
        channel_id: channel,
        page,
        limit,
        error: error.message,
      })
      return { status: error.response.status, message: error.response.statusText }
    }
  }

  /**
   * Obtiene productos detallados por IDs
   */
  async getAllProductsRefactoring(products: number[], visible = 1, parentCategory: number | null) {
    const baseUrl = this.baseUrl + '/v3/catalog/products'
    const visibilityParam = visible === 1 ? 'is_visible=1&' : ''
    const categoriesParam =
      parentCategory === null || parentCategory === 0 ? '' : `&categories:in=${parentCategory}`

    let allProducts: any[] = []
    let page = 1
    const limit = 250 // Máximo permitido por Bigcommerce

    while (true) {
      const offset = (page - 1) * limit
      const commonParams = `id:in=${products}&availability=available&sort=id&direction=desc&include=images,variants&limit=${limit}&page=${page}${categoriesParam}`
      const url = `${baseUrl}?${visibilityParam}${commonParams}`

      try {
        const { data } = await axios.get(url, { headers: this.headers, timeout: 30000 })

        if (!data.data || data.data.length === 0) {
          break // No hay más productos
        }

        allProducts = allProducts.concat(data.data)

        // Si obtenemos menos productos que el límite, es la última página
        if (data.data.length < limit) {
          break
        }

        page++
      } catch (error) {
        this.logger.error('❌ Error obteniendo página de productos', {
          page,
          offset,
          error: error.message,
        })
        throw error
      }
    }

    return { data: allProducts, meta: { total: allProducts.length } }
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
        pagesToFetch.map((pageNumber) =>
          axios
            .get(endpoint + pageNumber, { headers: this.headers })
            .then((response) => response.data.data)
        )
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

  /**
   * 🔍 Obtener metafields de un producto por clave específica
   * @param product - ID del producto
   * @param key - Clave del metafield a buscar
   * @returns Valor del metafield o array vacío si no existe
   */
  async getMetafieldsByProduct(product: number, key: string) {
    try {
      const results = await axios.get(
        `${this.baseUrl}/v3/catalog/products/${product}/metafields?key=${key}`,
        {
          headers: {
            'X-Auth-Token': env.get('BIGCOMMERCE_API_TOKEN'),
            'Content-Type': 'application/json',
            'host': 'api.bigcommerce.com',
          },
        }
      )

      let data = results.data.data
      if (data.length > 0) {
        data = data[0].value
      }

      return data
    } catch (error) {
      this.logger.error('❌ Error obteniendo metafield', {
        product_id: product,
        key,
        error: error.message,
      })
      return []
    }
  }

  /**
   * ⭐ Obtener reviews de un producto
   * @param product - ID del producto
   * @returns Objeto con reviews, cantidad y rating promedio
   */
  async getReviewsByProduct(product: number) {
    try {
      const results = await axios.get(
        `${this.baseUrl}/v3/catalog/products/${product}/reviews?status=1`,
        {
          headers: {
            'X-Auth-Token': env.get('BIGCOMMERCE_API_TOKEN'),
            'Content-Type': 'application/json',
            'host': 'api.bigcommerce.com',
          },
        }
      )

      let data = results.data.data
      let arrayReviews: any[] = []
      let totalRating = 0

      // TODO: Implementar consulta a ImagesReview cuando esté disponible
      // const images = await ImagesReview.query().where('product_id', product).exec()

      await Promise.all(
        data.map(async function (elem: any, _index: number) {
          // TODO: Implementar lógica de imágenes cuando ImagesReview esté disponible
          // let imagesUrl = (images.find(image => image.title === elem.title && image.name === elem.name) || {}).images_url
          // let imagesArray = imagesUrl ? imagesUrl.split(',') : []
          let imagesArray: string[] = [] // Temporal hasta implementar ImagesReview

          let returnReviews = {
            id: elem.id,
            name: elem.name,
            title: elem.title,
            text: elem.text,
            rating: elem.rating,
            date: elem.date_reviewed,
            images_url: imagesArray,
          }
          totalRating = totalRating + elem.rating
          arrayReviews.push(returnReviews)
        })
      )

      let reviews = {
        product_id: product,
        quantity: arrayReviews.length,
        rating: arrayReviews.length > 0 ? totalRating / arrayReviews.length : 0,
        reviews: arrayReviews,
      }

      return reviews
    } catch (error) {
      this.logger.error('❌ Error obteniendo reviews para producto', {
        product_id: product,
        error: error.message,
      })
      return {
        product_id: product,
        quantity: 0,
        rating: 0,
        reviews: [],
      }
    }
  }
}
