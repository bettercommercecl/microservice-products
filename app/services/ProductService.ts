import BigCommerceService from './BigCommerceService.js'
import Product from '../models/Product.js'
import Variant from '../models/Variant.js'
import CategoryProduct from '../models/CategoryProduct.js'
import OptionOfProducts from '../models/Option.js'
import db from '@adonisjs/lucid/services/db'
import Env from '#start/env'
import { GeneralService } from './GeneralService.js'
import CatalogSafeStock from '#models/CatalogSafeStock'
import pLimit from 'p-limit'
import ChannelProduct from '#models/ChannelProduct'
import { channel } from 'diagnostics_channel'
import Database from '@adonisjs/lucid/services/db'
import CategoryService from './CategoryService.js'
import env from '#start/env'
import Category from '../models/Category.js'

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
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

// Función utilitaria para reintentar una promesa ante timeout
async function withRetry(fn: () => Promise<any>, retries = 3, delay = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      if (i === retries - 1) throw err;
      if (err.code === 'ETIMEDOUT' || err.message?.includes('ETIMEDOUT')) {
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw err;
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
        data: products
      }
    } catch (error) {
      throw new Error(`Error al obtener productos: ${error instanceof Error ? error.message : 'Error desconocido'}`)
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
        data: product
      }
    } catch (error) {
      throw new Error(`Error al obtener producto: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    }
  }

  /**
   * Obtiene todos los IDs de productos asignados a un canal, recorriendo todas las páginas
   */
  async getAllProductIdsByChannel(channelId: number, limit = 200) {
    console.time('getAllProductIdsByChannel')
    let allIds: number[] = [];
    // 1. Primera petición para saber cuántas páginas hay
    const firstResponse = await this.bigCommerceService.getProductsByChannel(channelId, 1, limit);
    const { data: firstData, meta } = firstResponse;
    if (!firstData || firstData.length === 0) {
      console.timeEnd('getAllProductIdsByChannel')
      return [];
    }
    const ids = firstData.map((item: any) => item.product_id || item.id);
    allIds.push(...ids);

    // 2. Calcular total de páginas
    const totalPages = meta && meta.pagination ? meta.pagination.total_pages : 1;
    console.log(`[getAllProductIdsByChannel] Total páginas: ${totalPages}`)
    if (totalPages === 1) {
      console.timeEnd('getAllProductIdsByChannel')
      return allIds.filter(Boolean);
    }

    // 3. Lanzar el resto de páginas en paralelo (con límite de concurrencia)
    const limitConcurrency = pLimit(4); // Puedes ajustar el número
    const pagePromises = [];
    for (let page = 2; page <= totalPages; page++) {
      pagePromises.push(
        limitConcurrency(async () => {
          console.time(`[getAllProductIdsByChannel] Página ${page}`)
          const response = await this.bigCommerceService.getProductsByChannel(channelId, page, limit)
          console.timeEnd(`[getAllProductIdsByChannel] Página ${page}`)
          return response.data.map((item: any) => item.product_id || item.id)
        })
      );
    }
    const results = await Promise.all(pagePromises);
    results.forEach(ids => allIds.push(...ids));

    console.timeEnd('getAllProductIdsByChannel')
    return allIds.filter(Boolean);
  }

  /**
   * Sincroniza los productos desde BigCommerce
   */
  async syncProducts(channel_id : number) {
    try {
      let productsData: BigCommerceProduct[] = []
      let failedProducts: number[] = []

      // Obtener y guardar el stock de seguridad
      const inventory = await this.saveSafeStock()
      if (inventory && 'status' in inventory && inventory.status === 'Error') {
        return {
          success: false,
          message: 'Error al sincronizar el stock de seguridad',
          data: inventory
        }
      }

      // Obtener productos por canal (IDs completos paginados)
      // const channelId = Number(Env.get('BIGCOMMERCE_CHANNEL_ID'))
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
            variants: { success: true, message: 'Sin variantes para sincronizar', failed: [] }
          }
        }
      }
      // Procesar productos en lotes de 50
      const batchSize = 50
      const batches = []
      for (let i = 0; i < productIds.length; i += batchSize) {
        batches.push(productIds.slice(i, i + batchSize))
      }

      console.log('📋 Procesando en lotes:', batches.length)

      // Obtener detalles de productos en paralelo (limitando concurrencia)
      const limit = pLimit(8) // máximo 8 lotes en paralelo
      const batchResults = await Promise.all(
        batches.map((batchIds, index) =>
          limit(async () => {
            console.time(`Lote ${index + 1}`)
            console.log(`🔄 Procesando lote ${index + 1}/${batches.length} con ${batchIds.length} productos`)
            const productsPerPage = await this.bigCommerceService.getAllProductsRefactoring(batchIds, 0, channel_id)
            console.timeEnd(`Lote ${index + 1}`)
            console.log(`✅ Lote ${index + 1} completado, productos obtenidos:`, productsPerPage.data?.length || 0)
            return productsPerPage.data
          })
        )
      )

      // Combinar resultados
      productsData = batchResults.flat()
      console.log('�� Total de productos obtenidos:', productsData.length)

      if (productsData.length === 0) {
        return {
          success: true,
          message: 'No se pudieron obtener detalles de los productos',
          data: {
            products: { total: 0, failed: [] },
            categories: { success: true, message: 'Sin categorías para sincronizar', total: 0 },
            options: { success: true, message: 'Sin opciones para sincronizar', failed: [] },
            variants: { success: true, message: 'Sin variantes para sincronizar', failed: [] }
          }
        }
      }

      const formatProducts: FormattedProduct[] = await GeneralService.FormatProductsArray(productsData as any)
      console.log('🎯 Productos formateados:', formatProducts.length)
      if (formatProducts.length > 0) {
        // console.log('🔎 Primer producto formateado:', JSON.stringify(formatProducts[0], null, 2));
      }

      // Serializar manualmente los campos JSON antes de guardar
      const prepareForSave = (product: any) => ({
        ...product,
        images: product.images ? JSON.stringify(product.images) : null,
        meta_keywords: product.meta_keywords ? JSON.stringify(product.meta_keywords) : null,
        reviews: product.reviews ? JSON.stringify(product.reviews) : null,
        sizes: product.sizes ? JSON.stringify(product.sizes) : null,
      });
      const saveBatches: any[][] = []
      for (let i = 0; i < formatProducts.length; i += batchSize) {
        saveBatches.push(formatProducts.slice(i, i + batchSize).map(prepareForSave))
      }

      // Guardar productos en lotes pequeños y con concurrencia limitada
      const saveLimit = pLimit(8)
      let savedProducts: any[] = []
      let failedBatchProducts: { batch: number, error: any, products: any[] }[] = []
      for (let i = 0; i < saveBatches.length; i++) {
        try {
          console.log(`💾 Guardando lote de productos ${i + 1}/${saveBatches.length}...`)
          const result = await saveLimit(() => Product.updateOrCreateMany('id', saveBatches[i]))
          savedProducts = savedProducts.concat(result)
          console.log(`✅ Lote de productos ${i + 1} guardado (${result.length} productos)`)
        } catch (error) {
          console.error(`❌ Error en lote ${i + 1}:`, error)
          failedBatchProducts.push({ batch: i + 1, error, products: saveBatches[i] })
        }
      }

      // Identificar productos fallidos por ID
      failedProducts = failedBatchProducts.flatMap(f => f.products.map((p: any) => p.id))
      // Sincronizar relaciones
      const channelResult = await this.syncChannelByProduct(productsData, channel_id)
      const categoriesResult = await this.syncCategoriesByProduct(productsData)
      // Sincronizar filtros-productos después de categorías-productos
      const filtersProductsResult = await this.syncFiltersProducts()
      const optionsResult = await this.syncOptionsByProduct(productsData)
      const variantsResult = await this.syncVariantsByProduct(productsData)

      console.log('🎉 Sincronización COMPLETA');

      return {
        success: true,
        message: 'Proceso de sincronización completado',
        data: {
          products: {
            total: formatProducts.length,
            failed: failedProducts
          },
          channels: channelResult,
          categories: categoriesResult,
          options: optionsResult,
          variants: variantsResult,
          filters_products: filtersProductsResult
        }
      }
    } catch (error) {
      console.error('Error en la sincronización de productos:', error)
      return {
        success: false,
        message: 'Error durante el proceso de sincronización',
        error: error instanceof Error ? error.message : 'Error desconocido'
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
      const productIds = products.map(product => product.id)
      await CategoryProduct.query().whereIn('product_id', productIds).delete()
      console.timeEnd('Limpieza categorías existentes')

      // Preparar datos de categorías
      console.time('Preparación datos categorías')
      const productsList = products.map(product => {
        return product.categories.map((categoryId: number) => ({
          product_id: product.id,
          category_id: categoryId
        }))
      }).flat()
      console.timeEnd('Preparación datos categorías')
      console.log(`📊 Total de relaciones a insertar: ${productsList.length}`)

      // Guardar nuevas categorías en batches de 10,000 (sin transacción)
      console.time('Inserción categorías')
      const batchSize = 10000;
      let totalInserted = 0;
      for (let i = 0; i < productsList.length; i += batchSize) {
        const batch = productsList.slice(i, i + batchSize);
        await CategoryProduct.createMany(batch);
        totalInserted += batch.length;
        console.log(`✅ Insertadas ${batch.length} relaciones en category_products (batch ${i / batchSize + 1}) - Total: ${totalInserted}`);
      }
      console.timeEnd('Inserción categorías')
      console.log(`✅ Guardadas ${totalInserted} relaciones en category_products`)

      return {
        success: true,
        message: 'Categorías sincronizadas correctamente',
        total: totalInserted
      }
    } catch (error) {
      let errorMessage = error instanceof Error ? error.message : 'Error desconocido'
      // Si el error es de foreign key en category_id, agrega mensaje explicativo
      if (errorMessage.includes('category_products_category_id_fkey')) {
        errorMessage += ' — Probablemente se han creado nuevas categorías en BigCommerce que aún no existen en la base de datos local. Por favor, sincroniza las categorías antes de volver a intentar.'
      }
      return {
        success: false,
        message: 'Error al sincronizar categorías',
        error: errorMessage
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
      const productsList = products.map(product => ({
        product_id: product.id,
        channel_id: channel_id
      }))

      // Guardar nuevas relaciones
      await ChannelProduct.createMany(productsList, { client: trx })
      await trx.commit()

      return {
        success: true,
        message: 'Canales sincronizados correctamente',
        total: productsList.length
      }
    } catch (error) {
      await trx.rollback()
      return {
        success: false,
        message: 'Error al sincronizar canales',
        error: error instanceof Error ? error.message : 'Error desconocido'
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
    const pLimit = (await import('p-limit')).default
    const limit = pLimit(4) // Máximo 4 productos concurrentes

    try {
      console.time('Procesamiento total de opciones')
      
      // Procesar productos en batches pequeños
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)
        console.log(`📦 Procesando batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)} (${batch.length} productos)`)
        
        await Promise.all(
          batch.map(product => 
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
                  options.map(async option => {
                    try {
                      const formattedOptions = option.options.map((opt: any) => ({
                        id: opt.id,
                        label: opt.label,
                        value: opt.value_data || ''
                      }))

                      await OptionOfProducts.create({
                        label: option.label,
                        product_id: option.product_id,
                        option_id: option.id,
                        options: toJsonField(formattedOptions)
                      })
                    } catch (error) {
                      failedOptions.push({
                        product_id: product.id,
                        option_id: option.id,
                        error: error instanceof Error ? error.message : 'Error desconocido'
                      })
                    }
                  })
                )
                console.timeEnd(`Producto ${product.id} - crear nuevas opciones`)
                console.log(`✅ Guardadas opciones para producto ${product.id} en options`)
              } catch (error) {
                console.error(`❌ Error procesando producto ${product.id}:`, error instanceof Error ? error.message : 'Error desconocido')
                failedOptions.push({
                  product_id: product.id,
                  error: error instanceof Error ? error.message : 'Error desconocido'
                })
              }
            })
          )
        )
      }
      
      console.timeEnd('Procesamiento total de opciones')

      return {
        success: failedOptions.length === 0,
        message: failedOptions.length > 0 ? `Algunas opciones no se sincronizaron correctamente (${failedOptions.length} errores)` : 'Opciones sincronizadas correctamente',
        failed: failedOptions
      }
    } catch (error) {
      console.error('❌ Error general en syncOptionsByProduct:', error instanceof Error ? error.message : 'Error desconocido')
      return {
        success: false,
        message: 'Error al sincronizar opciones',
        error: error instanceof Error ? error.message : 'Error desconocido'
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
    const pLimit = (await import('p-limit')).default
    const limit = pLimit(8) // Aumentar concurrencia a 8

    try {
      console.time('Procesamiento total de variantes')
      
      // Cache de categorías para evitar queries repetidas
      const categoryCache = new Map()
      const childTags = await CategoryService.getChildCategories(Number(env.get('ID_BENEFITS')))
      const childCampaigns = await CategoryService.getChildCategories(Number(env.get('ID_CAMPAIGNS')))
      
      // Procesar productos en batches más grandes
      for (let i = 0; i < products.length; i += batchSize) {
        const batch = products.slice(i, i + batchSize)
        console.log(`📦 Procesando batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)} (${batch.length} productos)`)
        
        await Promise.all(
          batch.map(product => 
            limit(async () => {
              try {
                console.time(`Producto ${product.id} - TOTAL`)
                
                // 1. FORMATVARIANTSBYPRODUCT
                const variants = await withRetry(() => GeneralService.formatVariantsByProduct(product as any))

                if (!Array.isArray(variants) || variants.length === 0) {
                  console.log(`⚠️ Producto ${product.id} - Sin variantes`)
                  console.timeEnd(`Producto ${product.id} - TOTAL`)
                  return
                }

                // 2. ELIMINAR VARIANTES ANTERIORES
                await Variant.query().where('product_id', product.id).delete()

                // 3. PROCESAR CATEGORÍAS
                const categoryIds = Array.isArray(product.categories)
                  ? product.categories.map((cat: any) => cat.category_id || cat)
                  : []
                
                let categoryTitles: string[] = []
                if (categoryIds.length > 0) {
                  // Usar cache para evitar queries repetidas
                  const uncachedIds = categoryIds.filter(id => !categoryCache.has(id))
                  if (uncachedIds.length > 0) {
                    const categoryRecords = await Category.query().whereIn('category_id', uncachedIds)
                    categoryRecords.forEach(cat => {
                      categoryCache.set(cat.category_id, cat.title)
                    })
                  }
                  categoryTitles = categoryIds
                    .map(id => categoryCache.get(id))
                    .filter(Boolean)
                }

                // 4. QUERIES DE TAGS/CAMPAIGNS
                const [tags, campaigns] = await Promise.all([
                  CategoryService.getCampaignsByCategory(product.id, childTags),
                  CategoryService.getCampaignsByCategory(product.id, childCampaigns)
                ])

                const keywords = [
                  ...categoryTitles,
                  ...tags,
                  ...campaigns
                ].filter(Boolean).join(', ')

                // 5. CREAR VARIANTES
                await Promise.all(
                  variants.map(async (variant: any) => {
                    try {
                      await Variant.create({
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
                        image: variant.image,
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
                      })
                    } catch (error) {
                      console.error('❌ Error al guardar variante:', {
                        product_id: product.id,
                        variant_id: variant.id,
                        sku: variant.sku,
                        error: error instanceof Error ? error.message : error
                      })
                      failedVariants.push({
                        product_id: product.id,
                        variant_id: variant.id,
                        sku: variant.sku,
                        error: error instanceof Error ? error.message : 'Error desconocido'
                      })
                    }
                  })
                )
                console.log(`✅ Guardadas variantes para producto ${product.id} en variants`)
                console.timeEnd(`Producto ${product.id} - TOTAL`)
              } catch (error) {
                console.error(`❌ Error procesando producto ${product.id}:`, error instanceof Error ? error.message : 'Error desconocido')
                failedVariants.push({
                  product_id: product.id,
                  error: error instanceof Error ? error.message : 'Error desconocido'
                })
              }
            })
          )
        )
      }
      
      console.timeEnd('Procesamiento total de variantes')

      return {
        success: failedVariants.length === 0,
        message: failedVariants.length > 0 ? `Algunas variantes no se sincronizaron correctamente (${failedVariants.length} errores)` : 'Variantes sincronizadas correctamente',
        failed: failedVariants
      }
    } catch (error) {
      console.error('❌ Error general en syncVariantsByProduct:', error instanceof Error ? error.message : 'Error desconocido')
      return {
        success: false,
        message: 'Error al sincronizar variantes',
        error: error instanceof Error ? error.message : 'Error desconocido'
      }
    }
  }

  /**
   * Guarda el stock de seguridad
   */
  private async saveSafeStock() {
    try {
      const productInventory = await this.bigCommerceService.getSafeStockGlobal();

      if (Array.isArray(productInventory)) {
        const formattedInventory = productInventory.map((item: SafeStockItem) => ({
          sku: item.identity.sku.trim(),
          variant_id: item.identity.variant_id,
          product_id: item.identity.product_id,
          safety_stock: item.settings.safety_stock,
          warning_level: item.settings.warning_level,
          available_to_sell: item.available_to_sell,
          bin_picking_number: item.settings.bin_picking_number
        }))

        const result = await CatalogSafeStock.updateOrCreateMany('sku', formattedInventory)
        return {
          success: true,
          message: 'Stock de seguridad sincronizado correctamente',
          data: result
        }
      } else if (productInventory && productInventory.status === 'Error') {
        return productInventory;
      }
    } catch (error) {
      return {
        status: 'Error',
        message: 'Error al sincronizar el stock de seguridad',
        error: error instanceof Error ? error.message : 'Error desconocido'
      }
    }
  }

  /**
   * Sincroniza las relaciones producto-categoría hija de TODAS las categorías "Filtros" en filters_products
   */
  private async syncFiltersProducts() {
    const FiltersProduct = (await import('#models/FiltersProduct')).default
    // 1. Buscar TODAS las categorías cuyo título contenga "Filtros"
    console.log('🔍 Buscando categorías Filtros...')
    console.time('Búsqueda categorías Filtros')
    const idAdvanced = Number(env.get('ID_ADVANCED'))
    if (!idAdvanced) {
      throw new Error('ID_ADVANCED no está configurado en las variables de entorno')
    }
    const filtrosCategories = await Category.query().where('parent_id', idAdvanced)
    console.timeEnd('Búsqueda categorías Filtros')
    if (filtrosCategories.length === 0) {
      console.warn(`No existen categorías hijas de la categoría ${idAdvanced}`)
      return { success: false, message: `No existen categorías hijas de la categoría ${idAdvanced}` }
    }
    console.log(`✅ Encontradas ${filtrosCategories.length} categorías hijas de ${idAdvanced}`)
    console.log('Categorías encontradas:', filtrosCategories.map(cat => ({ id: cat.category_id, title: cat.title })))
    const filtrosCategoryIds = filtrosCategories.map(cat => cat.category_id)

    // 2. Obtener los hijos de Filtros
    console.log('🔍 Obteniendo hijos de Filtros...')
    console.time('Obtención hijos')
    const hijos = filtrosCategoryIds.length > 0 ? await Category.query().whereIn('parent_id', filtrosCategoryIds) : []
    console.timeEnd('Obtención hijos')
    const hijosIds = hijos.map(cat => cat.category_id)
    console.log(`✅ Encontrados ${hijos.length} hijos de Filtros`)
    if (hijos.length > 0) {
      console.log('Hijos encontrados:', hijos.map(cat => ({ id: cat.category_id, title: cat.title, parent_id: cat.parent_id })))
    }

    // 3. Usar directamente los hijos (no necesitamos nietos)
    console.log('🔍 Usando categorías hijas directamente...')
    if (hijosIds.length === 0) {
      return { success: false, message: 'No hay categorías hijas de Filtros' }
    }
    console.log(`✅ Usando ${hijos.length} categorías hijas de Filtros`)

    // 4. Obtener todas las relaciones producto-categoría para esos hijos
    console.log('🔍 Obteniendo relaciones producto-categoría para hijos...')
    console.time('Búsqueda relaciones')
    const relations = await CategoryProduct.query().whereIn('category_id', hijosIds)
    console.timeEnd('Búsqueda relaciones')
    console.log(`✅ Encontradas ${relations.length} relaciones producto-categoría`)

    // 5. Limpiar tabla filters_products (opcional, si quieres reemplazar todo)
    console.log('🧹 Limpiando tabla filters_products...')
    console.time('Limpieza tabla')
    await FiltersProduct.truncate()
    console.timeEnd('Limpieza tabla')
    console.log('✅ Tabla filters_products limpiada')

    // 6. Guardar las relaciones en filters_products
    console.log('💾 Insertando relaciones en filters_products...')
    console.time('Inserción relaciones')
    if (relations.length > 0) {
      const batchSize = 5000;
      let totalInserted = 0;
      for (let i = 0; i < relations.length; i += batchSize) {
        const batch = relations.slice(i, i + batchSize);
        await FiltersProduct.createMany(
          batch.map(rel => ({
            product_id: rel.product_id,
            category_id: rel.category_id
          }))
        );
        totalInserted += batch.length;
        console.log(`✅ Insertadas ${batch.length} relaciones (batch ${Math.floor(i / batchSize) + 1}) - Total: ${totalInserted}`);
      }
    }
    console.timeEnd('Inserción relaciones')
    console.log('✅ Relaciones insertadas en filters_products')

    return {
      success: true,
      message: `Sincronizadas ${relations.length} relaciones en filters_products (hijos de Filtros)`
    }
  }
} 