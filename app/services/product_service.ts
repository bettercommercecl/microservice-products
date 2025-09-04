import BigCommerceService from '#services/bigcommerce_service'
import Product from '#models/product'
// import { GeneralService } from '#services/general_service'
import InventoryService from '#services/inventory_service'
import ChannelsService from '#services/channels_service'
import OptionsService from '#services/options_service'
import FiltersService from '#services/filters_service'
import VariantService from '#services/variant_service'
import pLimit from 'p-limit'
import CategoryService from '#services/categories_service'
import Logger from '@adonisjs/core/services/logger'

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

interface FormattedProduct {
  id: number
  title: string
  url: string
  parent_id?: number
  order?: number
  image?: string
  is_visible?: boolean
  tree_id?: number
}

// Función utilitaria para reintentar una promesa ante timeout
async function withRetry(fn: () => Promise<any>, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err: any) {
      if (i === retries - 1) throw err
      if (err.code === 'ETIMEDOUT' || err.message?.includes('ETIMEDOUT')) {
        await new Promise((res) => setTimeout(res, delay))
      } else {
        throw err
      }
    }
  }
}

export default class ProductService {
  private bigCommerceService: BigCommerceService
  private inventoryService: InventoryService
  private channelsService: ChannelsService
  private optionsService: OptionsService
  private categoryService: CategoryService
  private filtersService: FiltersService
  private variantService: VariantService
  private readonly logger = Logger.child({ service: 'ProductService' })

  constructor() {
    this.bigCommerceService = new BigCommerceService()
    this.inventoryService = new InventoryService()
    this.channelsService = new ChannelsService()
    this.optionsService = new OptionsService()
    this.categoryService = new CategoryService()
    this.filtersService = new FiltersService()
    this.variantService = new VariantService()
  }

  /**
   * Obtiene todos los productos
   */
  async getAllProducts() {
    try {
      const products = await Product.all()
      return {
        success: true,
        data: products,
      }
    } catch (error) {
      throw new Error(
        `Error al obtener productos: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }
  /**
   * Obtiene un producto por ID
   */
  async getProductById(id: number) {
    try {
      const product = await Product.findOrFail(id)
      return {
        success: true,
        data: product,
      }
    } catch (error) {
      throw new Error(
        `Error al obtener producto: ${error instanceof Error ? error.message : 'Error desconocido'}`
      )
    }
  }

  /**
   * Obtiene todos los IDs de productos asignados a un canal, recorriendo todas las páginas
   */
  async getAllProductIdsByChannel(channelId: number, limit = 200) {
    console.time('getAllProductIdsByChannel')
    let allIds: number[] = []
    // 1. Primera petición para saber cuántas páginas hay
    const firstResponse = await this.bigCommerceService.getProductsByChannel(channelId, 1, limit)
    const { data: firstData, meta } = firstResponse
    if (!firstData || firstData.length === 0) {
      console.timeEnd('getAllProductIdsByChannel')
      return []
    }
    const ids = firstData.map((item: any) => item.product_id || item.id)
    allIds.push(...ids)

    // 2. Calcular total de páginas
    const totalPages = meta && meta.pagination ? meta.pagination.total_pages : 1
    console.log(`[getAllProductIdsByChannel] Total páginas: ${totalPages}`)
    if (totalPages === 1) {
      console.timeEnd('getAllProductIdsByChannel')
      return allIds.filter(Boolean)
    }

    // 3. Lanzar el resto de páginas en paralelo (con límite de concurrencia optimizado)
    const limitConcurrency = pLimit(15) // 🚀 OPTIMIZADO: Aumentado de 4 a 15 para mejor rendimiento
    const pagePromises = []
    for (let page = 2; page <= totalPages; page++) {
      pagePromises.push(
        limitConcurrency(async () => {
          console.time(`[getAllProductIdsByChannel] Página ${page}`)
          const response = await this.bigCommerceService.getProductsByChannel(
            channelId,
            page,
            limit
          )
          console.timeEnd(`[getAllProductIdsByChannel] Página ${page}`)
          return response.data.map((item: any) => item.product_id || item.id)
        })
      )
    }
    const results = await Promise.all(pagePromises)
    results.forEach((pageIds: number[]) => allIds.push(...pageIds))

    console.timeEnd('getAllProductIdsByChannel')
    return allIds.filter(Boolean)
  }

  /**
   * Sincroniza los productos desde BigCommerce
   */
  // async syncProducts(channel_id: number) {
  //   try {
  //     let productsData: BigCommerceProduct[] = []
  //     let failedProducts: number[] = []

  //     // 🛡️ Sincronizar stock de seguridad usando InventoryService (SRP)
  //     this.logger.info('🛡️ Sincronizando stock de seguridad...')
  //     const inventoryResult = await this.inventoryService.syncSafeStock()
  //     if (inventoryResult && 'status' in inventoryResult && inventoryResult.status === 'Error') {
  //       this.logger.error('❌ Error en sincronización de stock de seguridad')
  //       return {
  //         success: false,
  //         message: 'Error al sincronizar el stock de seguridad',
  //         data: inventoryResult,
  //       }
  //     }
  //     this.logger.info('✅ Stock de seguridad sincronizado correctamente')

  //     // Obtener productos por canal (IDs completos paginados)
  //     const productIds = await this.getAllProductIdsByChannel(channel_id, 200)
  //     console.log('🔢 Total de IDs de productos obtenidos del canal:', productIds.length)

  //     if (productIds.length === 0) {
  //       return {
  //         success: true,
  //         message: 'No se encontraron productos en el canal especificado',
  //         data: {
  //           products: { total: 0, failed: [] },
  //           categories: { success: true, message: 'Sin categorías para sincronizar', total: 0 },
  //           options: { success: true, message: 'Sin opciones para sincronizar', failed: [] },
  //           variants: { success: true, message: 'Sin variantes para sincronizar', failed: [] },
  //         },
  //       }
  //     }

  //     // 🚀 OPTIMIZACIÓN: Aumentar tamaño de lotes para mejor rendimiento
  //     const batchSize = 150 // Aumentado de 50 a 150
  //     const batches = []
  //     for (let i = 0; i < productIds.length; i += batchSize) {
  //       batches.push(productIds.slice(i, i + batchSize))
  //     }

  //     Logger.info(`📋 Procesando productos en ${batches.length} lotes`)

  //     // 🚀 OPTIMIZACIÓN: Aumentar concurrencia para operaciones de red
  //     const productLimit = pLimit(25) // Aumentado de 8 a 25 para mejor rendimiento
  //     const batchResults = await Promise.all(
  //       batches.map((batchIds, index) =>
  //         productLimit(async () => {
  //           Logger.info(
  //             `🔄 Procesando lote ${index + 1}/${batches.length} (${batchIds.length} productos)`
  //           )
  //           const productsPerPage = await this.bigCommerceService.getAllProductsRefactoring(
  //             batchIds,
  //             0,
  //             channel_id
  //           )
  //           Logger.info(
  //             `✅ Lote ${index + 1} completado (${productsPerPage.data?.length || 0} productos)`
  //           )
  //           return productsPerPage.data
  //         })
  //       )
  //     )

  //     // Combinar resultados
  //     productsData = batchResults.flat()
  //     Logger.info(`📊 Total de productos obtenidos de BigCommerce: ${productsData.length}`)

  //     if (productsData.length === 0) {
  //       return {
  //         success: true,
  //         message: 'No se pudieron obtener detalles de los productos',
  //         data: {
  //           products: { total: 0, failed: [] },
  //           categories: { success: true, message: 'Sin categorías para sincronizar', total: 0 },
  //           options: { success: true, message: 'Sin opciones para sincronizar', failed: [] },
  //           variants: { success: true, message: 'Sin variantes para sincronizar', failed: [] },
  //         },
  //       }
  //     }

  //     const formatProducts: FormattedProduct[] = await GeneralService.FormatProductsArray(
  //       productsData as any
  //     )
  //     Logger.info(`🎯 Productos formateados: ${formatProducts.length}`)

  //     // Serializar manualmente los campos JSON antes de guardar
  //     const prepareForSave = (product: any) => ({
  //       ...product,
  //       images: product.images ? JSON.stringify(product.images) : null,
  //       meta_keywords: product.meta_keywords ? JSON.stringify(product.meta_keywords) : null,
  //       reviews: product.reviews ? JSON.stringify(product.reviews) : null,
  //       sizes: product.sizes ? JSON.stringify(product.sizes) : null,
  //     })
  //     const saveBatches: any[][] = []
  //     for (let i = 0; i < formatProducts.length; i += batchSize) {
  //       saveBatches.push(formatProducts.slice(i, i + batchSize).map(prepareForSave))
  //     }

  //     // 🚀 OPTIMIZACIÓN: Aumentar concurrencia para operaciones de base de datos
  //     const saveLimit = pLimit(25) // Aumentado de 8 a 25
  //     let savedProducts: any[] = []
  //     let failedBatchProducts: { batch: number; error: any; products: any[] }[] = []
  //     for (let i = 0; i < saveBatches.length; i++) {
  //       try {
  //         Logger.info(`💾 Guardando lote de productos ${i + 1}/${saveBatches.length}`)
  //         const result = await saveLimit(() => Product.updateOrCreateMany('id', saveBatches[i]))
  //         savedProducts = savedProducts.concat(result)
  //         Logger.info(`✅ Lote de productos ${i + 1} guardado (${result.length} productos)`)
  //       } catch (error) {
  //         Logger.error(`❌ Error en lote ${i + 1}:`, error)
  //         failedBatchProducts.push({ batch: i + 1, error, products: saveBatches[i] })
  //       }
  //     }

  //     // Identificar productos fallidos por ID
  //     failedProducts = failedBatchProducts.flatMap((f) => f.products.map((p: any) => p.id))

  //     // 🚀 OPTIMIZACIÓN: Ejecutar todas las sincronizaciones en paralelo para máximo rendimiento
  //     this.logger.info('🔄 Iniciando sincronización de relaciones en paralelo')
  //     const [
  //       channelResult,
  //       categoriesResult,
  //       filtersProductsResult,
  //       optionsResult,
  //       variantsResult,
  //     ] = await Promise.all([
  //       this.channelsService.syncChannelByProduct(productsData, channel_id),
  //       this.categoryService.syncCategoriesByProduct(productsData),
  //       this.filtersService.syncFiltersProducts(),
  //       this.optionsService.syncOptionsByProduct(productsData),
  //       this.variantService.syncVariantsByProduct(productsData),
  //     ])

  //     Logger.info('🎉 Sincronización de productos completada')

  //     return {
  //       success: true,
  //       message: 'Proceso de sincronización completado',
  //       data: {
  //         products: {
  //           total: formatProducts.length,
  //           failed: failedProducts,
  //         },
  //         channels: channelResult,
  //         categories: categoriesResult,
  //         options: optionsResult,
  //         variants: variantsResult,
  //         filters_products: filtersProductsResult,
  //       },
  //     }
  //   } catch (error) {
  //     Logger.error('Error en la sincronización de productos:', error)
  //     return {
  //       success: false,
  //       message: 'Error durante el proceso de sincronización',
  //       error: error instanceof Error ? error.message : 'Error desconocido',
  //     }
  //   }
  // }
}
