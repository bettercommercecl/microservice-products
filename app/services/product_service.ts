import BigCommerceService from './bigcommerce_service.js'
import Product from '../models/product.js'
import Variant from '../models/variant.js'
import CategoryProduct from '#models/category_product'
import OptionOfProducts from '../models/option.js'
import db from '@adonisjs/lucid/services/db'
import { GeneralService } from './general/general_service.js'
import CatalogSafeStock from '#models/catalog.safe.stock'
import pLimit from 'p-limit'
import ChannelProduct from '#models/channel_product'
import CategoryService from './category_service.js'
import env from '#start/env'
import Category from '../models/category.js'
import Logger from '@adonisjs/core/services/logger'
import FiltersProduct from '#models/filters_product'

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

// Utilidad para serializar campos JSON
function toJsonField(value: any) {
  if (value === null) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
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

  constructor() {
    this.bigCommerceService = new BigCommerceService()
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
    results.forEach((pageIds) => allIds.push(...pageIds))

    console.timeEnd('getAllProductIdsByChannel')
    return allIds.filter(Boolean)
  }

  /**
   * Sincroniza los productos desde BigCommerce
   */
  async syncProducts(channel_id: number) {
    try {
      let productsData: BigCommerceProduct[] = []
      let failedProducts: number[] = []

      // Obtener y guardar el stock de seguridad
      const inventory = await this.saveSafeStock()
      if (inventory && 'status' in inventory && inventory.status === 'Error') {
        return {
          success: false,
          message: 'Error al sincronizar el stock de seguridad',
          data: inventory,
        }
      }

      // Obtener productos por canal (IDs completos paginados)
      const productIds = await this.getAllProductIdsByChannel(channel_id, 200)
      console.log('🔢 Total de IDs de productos obtenidos del canal:', productIds.length)

      if (productIds.length === 0) {
        return {
          success: true,
          message: 'No se encontraron productos en el canal especificado',
          data: {
            products: { total: 0, failed: [] },
            categories: { success: true, message: 'Sin categorías para sincronizar', total: 0 },
            options: { success: true, message: 'Sin opciones para sincronizar', failed: [] },
            variants: { success: true, message: 'Sin variantes para sincronizar', failed: [] },
          },
        }
      }

      // 🚀 OPTIMIZACIÓN: Aumentar tamaño de lotes para mejor rendimiento
      const batchSize = 150 // Aumentado de 50 a 150
      const batches = []
      for (let i = 0; i < productIds.length; i += batchSize) {
        batches.push(productIds.slice(i, i + batchSize))
      }

      Logger.info(`📋 Procesando productos en ${batches.length} lotes`)

      // 🚀 OPTIMIZACIÓN: Aumentar concurrencia para operaciones de red
      const productLimit = pLimit(25) // Aumentado de 8 a 25 para mejor rendimiento
      const batchResults = await Promise.all(
        batches.map((batchIds, index) =>
          productLimit(async () => {
            Logger.info(
              `🔄 Procesando lote ${index + 1}/${batches.length} (${batchIds.length} productos)`
            )
            const productsPerPage = await this.bigCommerceService.getAllProductsRefactoring(
              batchIds,
              0,
              channel_id
            )
            Logger.info(
              `✅ Lote ${index + 1} completado (${productsPerPage.data?.length || 0} productos)`
            )
            return productsPerPage.data
          })
        )
      )

      // Combinar resultados
      productsData = batchResults.flat()
      Logger.info(`📊 Total de productos obtenidos de BigCommerce: ${productsData.length}`)

      if (productsData.length === 0) {
        return {
          success: true,
          message: 'No se pudieron obtener detalles de los productos',
          data: {
            products: { total: 0, failed: [] },
            categories: { success: true, message: 'Sin categorías para sincronizar', total: 0 },
            options: { success: true, message: 'Sin opciones para sincronizar', failed: [] },
            variants: { success: true, message: 'Sin variantes para sincronizar', failed: [] },
          },
        }
      }

      const formatProducts: FormattedProduct[] = await GeneralService.FormatProductsArray(
        productsData as any
      )
      Logger.info(`🎯 Productos formateados: ${formatProducts.length}`)

      // Serializar manualmente los campos JSON antes de guardar
      const prepareForSave = (product: any) => ({
        ...product,
        images: product.images ? JSON.stringify(product.images) : null,
        meta_keywords: product.meta_keywords ? JSON.stringify(product.meta_keywords) : null,
        reviews: product.reviews ? JSON.stringify(product.reviews) : null,
        sizes: product.sizes ? JSON.stringify(product.sizes) : null,
      })
      const saveBatches: any[][] = []
      for (let i = 0; i < formatProducts.length; i += batchSize) {
        saveBatches.push(formatProducts.slice(i, i + batchSize).map(prepareForSave))
      }

      // 🚀 OPTIMIZACIÓN: Aumentar concurrencia para operaciones de base de datos
      const saveLimit = pLimit(25) // Aumentado de 8 a 25
      let savedProducts: any[] = []
      let failedBatchProducts: { batch: number; error: any; products: any[] }[] = []
      for (let i = 0; i < saveBatches.length; i++) {
        try {
          Logger.info(`💾 Guardando lote de productos ${i + 1}/${saveBatches.length}`)
          const result = await saveLimit(() => Product.updateOrCreateMany('id', saveBatches[i]))
          savedProducts = savedProducts.concat(result)
          Logger.info(`✅ Lote de productos ${i + 1} guardado (${result.length} productos)`)
        } catch (error) {
          Logger.error(`❌ Error en lote ${i + 1}:`, error)
          failedBatchProducts.push({ batch: i + 1, error, products: saveBatches[i] })
        }
      }

      // Identificar productos fallidos por ID
      failedProducts = failedBatchProducts.flatMap((f) => f.products.map((p: any) => p.id))

      // 🚀 OPTIMIZACIÓN: Ejecutar todas las sincronizaciones en paralelo para máximo rendimiento
      Logger.info('🔄 Iniciando sincronización de relaciones en paralelo')
      const [
        channelResult,
        categoriesResult,
        filtersProductsResult,
        optionsResult,
        variantsResult,
      ] = await Promise.all([
        this.syncChannelByProduct(productsData, channel_id),
        this.syncCategoriesByProduct(productsData),
        this.syncFiltersProducts(),
        this.syncOptionsByProduct(productsData),
        this.syncVariantsByProduct(productsData),
      ])

      Logger.info('🎉 Sincronización de productos completada')

      return {
        success: true,
        message: 'Proceso de sincronización completado',
        data: {
          products: {
            total: formatProducts.length,
            failed: failedProducts,
          },
          channels: channelResult,
          categories: categoriesResult,
          options: optionsResult,
          variants: variantsResult,
          filters_products: filtersProductsResult,
        },
      }
    } catch (error) {
      Logger.error('Error en la sincronización de productos:', error)
      return {
        success: false,
        message: 'Error durante el proceso de sincronización',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * Sincroniza las categorías por producto
   */
  private async syncCategoriesByProduct(products: BigCommerceProduct[]) {
    try {
      // Limpiar categorías existentes SOLO de los productos actuales
      console.time('Limpieza categorías existentes')
      const productIds = products.map((product) => product.id)
      await CategoryProduct.query().whereIn('product_id', productIds).delete()
      console.timeEnd('Limpieza categorías existentes')

      // Preparar datos de categorías
      console.time('Preparación datos categorías')
      const productsList = products
        .map((product) => {
          return product.categories.map((categoryId: number) => ({
            product_id: product.id,
            category_id: categoryId,
          }))
        })
        .flat()
      console.timeEnd('Preparación datos categorías')
      console.log(`📊 Total de relaciones a insertar: ${productsList.length}`)

      // Guardar nuevas categorías en batches de 10,000 (sin transacción)
      console.time('Inserción categorías')
      const batchSize = 10000
      let totalInserted = 0
      for (let i = 0; i < productsList.length; i += batchSize) {
        const batch = productsList.slice(i, i + batchSize)
        await CategoryProduct.createMany(batch)
        totalInserted += batch.length
        console.log(
          `✅ Insertadas ${batch.length} relaciones en category_products (batch ${i / batchSize + 1}) - Total: ${totalInserted}`
        )
      }
      console.timeEnd('Inserción categorías')
      console.log(`✅ Guardadas ${totalInserted} relaciones en category_products`)

      return {
        success: true,
        message: 'Categorías sincronizadas correctamente',
        total: totalInserted,
      }
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      // Si el error es de foreign key en category_id, agrega mensaje explicativo
      if (errorMessage.includes('category_products_category_id_fkey')) {
        errorMessage +=
          ' — Probablemente se han creado nuevas categorías en BigCommerce que aún no existen en la base de datos local. Por favor, sincroniza las categorías antes de volver a intentar.'
      }
      return {
        success: false,
        message: 'Error al sincronizar categorías',
        error: errorMessage,
      }
    }
  }
  /**
   * Sincroniza los canales por producto
   */
  private async syncChannelByProduct(products: BigCommerceProduct[], channel_id: number) {
    const trx = await db.transaction()
    try {
      // Limpiar SOLO los registros del canal actual
      await ChannelProduct.query().useTransaction(trx).where('channel_id', channel_id).delete()

      // Preparar datos de canales
      const productsList = products.map((product) => ({
        product_id: product.id,
        channel_id: channel_id,
      }))

      // Guardar nuevas relaciones
      await ChannelProduct.createMany(productsList, { client: trx })
      await trx.commit()

      return {
        success: true,
        message: 'Canales sincronizados correctamente',
        total: productsList.length,
      }
    } catch (error) {
      await trx.rollback()
      return {
        success: false,
        message: 'Error al sincronizar canales',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }
  /**
   * Sincroniza las opciones por producto
   */
  private async syncOptionsByProduct(products: BigCommerceProduct[]) {
    console.log('🔄 Iniciando syncOptionsByProduct...')
    const failedOptions: any[] = []
    const batchSize = 10 // Procesar solo 10 productos a la vez
    const limit = pLimit(4) // Máximo 4 productos concurrentes

    try {
      console.time('Procesamiento total de opciones')

      // Procesar productos en batches pequeños
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)
        console.log(
          `📦 Procesando batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} (${batch.length} productos)`
        )

        await Promise.all(
          batch.map((product) =>
            limit(async () => {
              try {
                console.time(`Producto ${product.id} - formatOptionsByVariantByProduct`)
                const options = await GeneralService.formatOptionsByVariantByProduct(product as any)
                console.timeEnd(`Producto ${product.id} - formatOptionsByVariantByProduct`)

                if (!Array.isArray(options) || options.length === 0) {
                  console.log(`⚠️ Producto ${product.id} - Sin opciones`)
                  return
                }

                // Eliminar opciones anteriores SOLO del producto actual
                console.time(`Producto ${product.id} - eliminar opciones anteriores`)
                await OptionOfProducts.query().where('product_id', product.id).delete()
                console.timeEnd(`Producto ${product.id} - eliminar opciones anteriores`)

                // Crear nuevas opciones
                console.time(`Producto ${product.id} - crear nuevas opciones`)
                await Promise.all(
                  options.map(async (option) => {
                    try {
                      const formattedOptions = option.options.map((opt: any) => ({
                        id: opt.id,
                        label: opt.label,
                        value: opt.value_data || '',
                      }))

                      await OptionOfProducts.create({
                        label: option.label,
                        product_id: option.product_id,
                        option_id: option.id,
                        options: toJsonField(formattedOptions),
                      })
                    } catch (error) {
                      failedOptions.push({
                        product_id: product.id,
                        option_id: option.id,
                        error: error instanceof Error ? error.message : 'Error desconocido',
                      })
                    }
                  })
                )
                console.timeEnd(`Producto ${product.id} - crear nuevas opciones`)
                console.log(`✅ Guardadas opciones para producto ${product.id} en options`)
              } catch (error) {
                console.error(
                  `❌ Error procesando producto ${product.id}:`,
                  error instanceof Error ? error.message : 'Error desconocido'
                )
                failedOptions.push({
                  product_id: product.id,
                  error: error instanceof Error ? error.message : 'Error desconocido',
                })
              }
            })
          )
        )
      }

      console.timeEnd('Procesamiento total de opciones')

      return {
        success: failedOptions.length === 0,
        message:
          failedOptions.length > 0
            ? `Algunas opciones no se sincronizaron correctamente (${failedOptions.length} errores)`
            : 'Opciones sincronizadas correctamente',
        failed: failedOptions,
      }
    } catch (error) {
      console.error(
        '❌ Error general en syncOptionsByProduct:',
        error instanceof Error ? error.message : 'Error desconocido'
      )
      return {
        success: false,
        message: 'Error al sincronizar opciones',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * Sincroniza las variantes por producto
   */
  private async syncVariantsByProduct(products: BigCommerceProduct[]) {
    console.log('🔄 Iniciando syncVariantsByProduct...')
    const failedVariants: any[] = []
    const batchSize = 20 // Aumentar batch size
    const limit = pLimit(8) // Aumentar concurrencia a 8

    try {
      console.time('Procesamiento total de variantes')

      // Cache de categorías para evitar queries repetidas
      const categoryCache = new Map()
      const childTags = await CategoryService.getChildCategories(Number(env.get('ID_BENEFITS')))
      const childCampaigns = await CategoryService.getChildCategories(
        Number(env.get('ID_CAMPAIGNS'))
      )

      // Procesar productos en batches más grandes
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)
        console.log(
          `📦 Procesando batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(products.length / batchSize)} (${batch.length} productos)`
        )

        await Promise.all(
          batch.map((product) =>
            limit(async () => {
              try {
                console.time(`Producto ${product.id} - TOTAL`)

                // 1. FORMATVARIANTSBYPRODUCT
                const variants = await withRetry(() =>
                  GeneralService.formatVariantsByProduct(product as any)
                )

                if (!Array.isArray(variants) || variants.length === 0) {
                  console.log(`⚠️ Producto ${product.id} - Sin variantes`)
                  console.timeEnd(`Producto ${product.id} - TOTAL`)
                  return
                }

                // Log informativo del número de variantes
                Logger.info(`📦 Producto ${product.id}: procesando ${variants.length} variantes`)

                // 2. ELIMINAR VARIANTES ANTERIORES
                await Variant.query().where('product_id', product.id).delete()

                // 3. PROCESAR CATEGORÍAS
                const categoryIds = Array.isArray(product.categories)
                  ? product.categories.map((cat: any) => cat.category_id || cat)
                  : []

                let categoryTitles: string[] = []
                if (categoryIds.length > 0) {
                  // Usar cache para evitar queries repetidas
                  const uncachedIds = categoryIds.filter((id) => !categoryCache.has(id))
                  if (uncachedIds.length > 0) {
                    const categoryRecords = await Category.query().whereIn(
                      'category_id',
                      uncachedIds
                    )
                    categoryRecords.forEach((cat) => {
                      categoryCache.set(cat.category_id, cat.title)
                    })
                  }
                  categoryTitles = categoryIds.map((id) => categoryCache.get(id)).filter(Boolean)
                }

                // 4. QUERIES DE TAGS/CAMPAIGNS
                const [tags, campaigns] = await Promise.all([
                  CategoryService.getCampaignsByCategory(product.id, childTags),
                  CategoryService.getCampaignsByCategory(product.id, childCampaigns),
                ])

                const keywords = [...categoryTitles, ...tags, ...campaigns]
                  .filter(Boolean)
                  .join(', ')

                // 5. CREAR VARIANTES
                await Promise.all(
                  variants.map(async (variant: any) => {
                    try {
                      // 🔍 DEBUG: Mostrar datos que se van a guardar
                      const variantData = {
                        id: variant.id,
                        product_id: product.id,
                        title: variant.main_title,
                        sku: variant.sku,
                        normal_price: variant.normal_price,
                        discount_price: variant.discount_price,
                        cash_price: variant.cash_price,
                        discount_rate: variant.discount_rate,
                        stock: variant.stock,
                        warning_stock: variant.warning_stock,
                        image: variant.image || '', // 🚀 CORREGIDO: Usar variant.image como campo principal
                        images: Array.isArray(variant.images) ? variant.images : [],
                        hover: variant.hover,
                        quantity: variant.quantity,
                        armed_cost: variant.armed_cost,
                        armed_quantity: variant.armed_quantity,
                        weight: variant.weight,
                        height: variant.height,
                        width: variant.width,
                        depth: variant.depth,
                        type: variant.type,
                        options: Array.isArray(variant.options) ? variant.options : [],
                        keywords: keywords,
                      }

                      // Log informativo de guardado de variante
                      Logger.info(`💾 Guardando variante ${variant.id} (SKU: ${variant.sku})`)

                      await Variant.create(variantData)
                      Logger.info(`✅ Variante ${variant.id} guardada exitosamente`)
                    } catch (error) {
                      Logger.error(
                        `❌ Error al guardar variante ${variant.id} (SKU: ${variant.sku}):`,
                        error
                      )
                      failedVariants.push({
                        product_id: product.id,
                        variant_id: variant.id,
                        sku: variant.sku,
                        error: error instanceof Error ? error.message : 'Error desconocido',
                      })
                    }
                  })
                )
                console.log(`✅ Guardadas variantes para producto ${product.id} en variants`)
                console.timeEnd(`Producto ${product.id} - TOTAL`)
              } catch (error) {
                Logger.error(`❌ Error procesando producto ${product.id}:`, error)
                failedVariants.push({
                  product_id: product.id,
                  error: error instanceof Error ? error.message : 'Error desconocido',
                })
              }
            })
          )
        )
      }

      console.timeEnd('Procesamiento total de variantes')

      // 🔍 DEBUG: Mostrar resumen final
      console.log('📊 RESUMEN FINAL DE SINCRONIZACIÓN DE VARIANTES:', {
        total_productos_procesados: products.length,
        variantes_fallidas: failedVariants.length,
        detalles_errores: failedVariants.length > 0 ? failedVariants : 'Sin errores',
      })

      return {
        success: failedVariants.length === 0,
        message:
          failedVariants.length > 0
            ? `Algunas variantes no se sincronizaron correctamente (${failedVariants.length} errores)`
            : 'Variantes sincronizadas correctamente',
        failed: failedVariants,
      }
    } catch (error) {
      Logger.error('❌ Error general en syncVariantsByProduct:', error)
      return {
        success: false,
        message: 'Error al sincronizar variantes',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * Guarda el stock de seguridad
   */
  private async saveSafeStock() {
    try {
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

        const result = await CatalogSafeStock.updateOrCreateMany('sku', formattedInventory)
        return {
          success: true,
          message: 'Stock de seguridad sincronizado correctamente',
          data: result,
        }
      } else if (productInventory && productInventory.status === 'Error') {
        return productInventory
      }
    } catch (error) {
      return {
        status: 'Error',
        message: 'Error al sincronizar el stock de seguridad',
        error: error instanceof Error ? error.message : 'Error desconocido',
      }
    }
  }

  /**
   * Sincroniza las relaciones producto-categoría hija de TODAS las categorías "Filtros" en filters_products
   */
  private async syncFiltersProducts() {
    // 1. Buscar TODAS las categorías cuyo título contenga "Filtros"
    Logger.info('🔍 Buscando categorías Filtros...')
    const startTime = Date.now()
    const idAdvanced = Number(env.get('ID_ADVANCED'))
    if (!idAdvanced) {
      throw new Error('ID_ADVANCED no está configurado en las variables de entorno')
    }
    const filtrosCategories = await Category.query().where('parent_id', idAdvanced)
    Logger.info(`⏱️ Búsqueda categorías Filtros completada en ${Date.now() - startTime}ms`)
    if (filtrosCategories.length === 0) {
      Logger.warn(`No existen categorías hijas de la categoría ${idAdvanced}`)
      return {
        success: false,
        message: `No existen categorías hijas de la categoría ${idAdvanced}`,
      }
    }
    Logger.info(`✅ Encontradas ${filtrosCategories.length} categorías hijas de ${idAdvanced}`)
    Logger.info(
      `Categorías encontradas: ${filtrosCategories.map((cat) => ({ id: cat.category_id, title: cat.title }))}`
    )
    const filtrosCategoryIds = filtrosCategories.map((cat) => cat.category_id)

    // 2. Obtener los hijos de Filtros
    Logger.info('🔍 Obteniendo hijos de Filtros...')
    const hijosStartTime = Date.now()
    const hijos =
      filtrosCategoryIds.length > 0
        ? await Category.query().whereIn('parent_id', filtrosCategoryIds)
        : []
    Logger.info(`⏱️ Obtención hijos completada en ${Date.now() - hijosStartTime}ms`)
    const hijosIds = hijos.map((cat) => cat.category_id)
    Logger.info(`✅ Encontrados ${hijos.length} hijos de Filtros`)
    if (hijos.length > 0) {
      Logger.info(
        `Hijos encontrados: ${hijos.map((cat) => ({ id: cat.category_id, title: cat.title, parent_id: cat.parent_id }))}`
      )
    }

    // 3. Usar directamente los hijos (no necesitamos nietos)
    Logger.info('🔍 Usando categorías hijas directamente...')
    if (hijosIds.length === 0) {
      return { success: false, message: 'No hay categorías hijas de Filtros' }
    }
    Logger.info(`✅ Usando ${hijos.length} categorías hijas de Filtros`)

    // 4. Obtener todas las relaciones producto-categoría para esos hijos
    Logger.info('🔍 Obteniendo relaciones producto-categoría para hijos...')
    const relationsStartTime = Date.now()
    const relations = await CategoryProduct.query().whereIn('category_id', hijosIds)
    Logger.info(`⏱️ Búsqueda relaciones completada en ${Date.now() - relationsStartTime}ms`)
    Logger.info(`✅ Encontradas ${relations.length} relaciones producto-categoría`)

    // 5. Limpiar tabla filters_products (opcional, si quieres reemplazar todo)
    Logger.info('🧹 Limpiando tabla filters_products...')
    const cleanupStartTime = Date.now()
    await FiltersProduct.truncate()
    Logger.info(`⏱️ Limpieza tabla completada en ${Date.now() - cleanupStartTime}ms`)
    Logger.info('✅ Tabla filters_products limpiada')

    // 6. Guardar las relaciones en filters_products
    Logger.info('💾 Insertando relaciones en filters_products...')
    const insertStartTime = Date.now()
    if (relations.length > 0) {
      const batchSize = 5000
      let totalInserted = 0
      for (let i = 0; i < relations.length; i += batchSize) {
        const batch = relations.slice(i, i + batchSize)
        await FiltersProduct.createMany(
          batch.map((rel) => ({
            product_id: rel.product_id,
            category_id: rel.category_id,
          }))
        )
        totalInserted += batch.length
        Logger.info(
          `✅ Insertadas ${batch.length} relaciones (batch ${Math.floor(i / batchSize) + 1}) - Total: ${totalInserted}`
        )
      }
    }
    Logger.info(`⏱️ Inserción relaciones completada en ${Date.now() - insertStartTime}ms`)
    Logger.info('✅ Relaciones insertadas en filters_products')

    return {
      success: true,
      message: `Sincronizadas ${relations.length} relaciones en filters_products (hijos de Filtros)`,
    }
  }
}
