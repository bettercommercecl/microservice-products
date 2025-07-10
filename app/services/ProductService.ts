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
    let allIds: number[] = [];
    let page = 1;
    let totalPages = 1;
    do {
      const response = await this.bigCommerceService.getProductsByChannel(channelId, page, limit);
      const { data, meta } = response;
      if (!data || data.length === 0) break;
      // Si la respuesta es de assignments, usa product_id
      const ids = data.map((item: any) => item.product_id || item.id);
      allIds.push(...ids);
      // Calcula totalPages si la respuesta tiene meta.pagination
      if (meta && meta.pagination) {
        totalPages = meta.pagination.total_pages;
      } else {
        break;
      }
      page++;
    } while (page <= totalPages);
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
      // Procesar productos en lotes de 20
      const batchSize = 20
      const batches = []
      for (let i = 0; i < productIds.length; i += batchSize) {
        batches.push(productIds.slice(i, i + batchSize))
      }

      console.log('📋 Procesando en lotes:', batches.length)

      // Obtener detalles de productos en paralelo (limitando concurrencia)
      const limit = pLimit(5) // máximo 5 lotes en paralelo
      const batchResults = await Promise.all(
        batches.map((batchIds, index) =>
          limit(async () => {
            console.log(`🔄 Procesando lote ${index + 1}/${batches.length} con ${batchIds.length} productos`)
            const productsPerPage = await this.bigCommerceService.getAllProductsRefactoring(batchIds, 0, 2000, channel_id)
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
      const saveLimit = pLimit(5)
      let savedProducts: any[] = []
      for (let i = 0; i < saveBatches.length; i++) {
        console.log(`💾 Guardando lote de productos ${i + 1}/${saveBatches.length}...`)
        const result = await saveLimit(() => Product.updateOrCreateMany('id', saveBatches[i]))
        savedProducts = savedProducts.concat(result)
        console.log(`✅ Lote de productos ${i + 1} guardado (${result.length} productos)`)
      }

      // Identificar productos fallidos
      failedProducts = formatProducts
        .filter((product: FormattedProduct, index: number) => savedProducts[index]?.id === undefined)
        .map((product: FormattedProduct) => product.id)

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
    const trx = await db.transaction()
    try {
      // Limpiar categorías existentes SOLO de los productos actuales
      const productIds = products.map(product => product.id)
      await CategoryProduct.query().useTransaction(trx).whereIn('product_id', productIds).delete()

      // Preparar datos de categorías
      const productsList = products.map(product => {
        return product.categories.map((categoryId: number) => ({
          product_id: product.id,
          category_id: categoryId
        }))
      }).flat()

      // Guardar nuevas categorías
      await CategoryProduct.createMany(productsList, { client: trx })
      console.log(`✅ Guardadas ${productsList.length} relaciones en category_products`)

      await trx.commit()

      return {
        success: true,
        message: 'Categorías sincronizadas correctamente',
        total: productsList.length
      }
    } catch (error) {
      await trx.rollback()
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
    const trx = await db.transaction()
    const failedOptions: any[] = []

    try {
      await Promise.all(
        products.map(async product => {
          const options = await GeneralService.formatOptionsByVariantByProduct(product as any)

          if (!Array.isArray(options) || options.length === 0) {
            return
          }

          // Eliminar opciones anteriores SOLO del producto actual
          await OptionOfProducts.query().useTransaction(trx).where('product_id', product.id).delete()

          // Crear nuevas opciones
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
                }, { client: trx })
              } catch (error) {
                failedOptions.push({
                  product_id: product.id,
                  option_id: option.id,
                  error: error instanceof Error ? error.message : 'Error desconocido'
                })
              }
            })
          )
          console.log(`✅ Guardadas opciones para producto ${product.id} en options`)
        })
      )

      await trx.commit()

      return {
        success: failedOptions.length === 0,
        message: failedOptions.length > 0 ? 'Algunas opciones no se sincronizaron correctamente' : 'Opciones sincronizadas correctamente',
        failed: failedOptions
      }
    } catch (error) {
      await trx.rollback()
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
    const failedVariants: any[] = []
    const limit = pLimit(2) // Limita la concurrencia a 2

    try {
      await Promise.all(
        products.map(product =>
          limit(async () => {
            console.log(`🔄 Iniciando sincronización de producto ${product.id}`);
            // Espera 300ms entre peticiones para evitar el 429
            await new Promise(res => setTimeout(res, 300));
            console.log(`⏳ [${product.id}] Antes de formatVariantsByProduct`);
            const variants = await withRetry(() => GeneralService.formatVariantsByProduct(product as any));
            console.log(`✅ [${product.id}] Después de formatVariantsByProduct`);

            console.log(`⏳ [${product.id}] Antes de eliminar variantes`);
            await Variant.query().where('product_id', product.id).delete();
            console.log(`✅ [${product.id}] Después de eliminar variantes`);

            if (variants.length > 0) {
              await Promise.all(
                variants.map(async (variant: any) => {
                  try {
                    // Obtener los IDs de categorías del producto
                    const categoryIds = Array.isArray(product.categories)
                      ? product.categories.map((cat: any) => cat.category_id || cat)
                      : []
                    // Buscar los títulos de esas categorías en la tabla categories
                    const categoryRecords = categoryIds.length
                      ? await Category.query().whereIn('category_id', categoryIds)
                      : []
                    const categoryTitles = categoryRecords.map(cat => cat.title).filter(Boolean)
                    // Tags y campañas como antes
                    const childTags = await CategoryService.getChildCategories(Number(env.get('ID_BENEFITS')))
                    const childCampaigns = await CategoryService.getChildCategories(Number(env.get('ID_CAMPAIGNS')))
                    const tags = await CategoryService.getCampaignsByCategory(product.id, childTags)
                    const campaigns = await CategoryService.getCampaignsByCategory(product.id, childCampaigns)
                    const keywords = [
                      ...categoryTitles,
                      ...tags,
                      ...campaigns
                    ].filter(Boolean).join(', ')

                    console.log(`⏳ [${product.id}] Antes de crear variante ${variant.id}`);
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
                    console.log(`✅ [${product.id}] Variante ${variant.id} creada`);
                  } catch (error) {
                    console.error('❌ Error al guardar variante:', {
                      product_id: product.id,
                      variant_id: variant.id,
                      sku: variant.sku,
                      error: error instanceof Error ? error.message : error
                    });
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
            }
          })
        )
      )

      return {
        success: failedVariants.length === 0,
        message: failedVariants.length > 0 ? 'Algunas variantes no se sincronizaron correctamente' : 'Variantes sincronizadas correctamente',
        failed: failedVariants
      }
    } catch (error) {
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
    const filtrosCategories = await Category.query().whereILike('title', '%Filtros%')
    if (filtrosCategories.length === 0) {
      console.warn('No existen categorías con el título Filtros')
      return { success: false, message: 'No existen categorías con el título Filtros' }
    }
    const filtrosCategoryIds = filtrosCategories.map(cat => cat.category_id)

    // 2. Obtener los hijos de Filtros
    const hijos = filtrosCategoryIds.length > 0 ? await Category.query().whereIn('parent_id', filtrosCategoryIds) : []
    const hijosIds = hijos.map(cat => cat.category_id)

    // 3. Obtener los hijos de esos hijos (nietos de Filtros)
    const nietos = hijosIds.length > 0 ? await Category.query().whereIn('parent_id', hijosIds) : []
    const nietosIds = nietos.map(cat => cat.category_id)
    if (nietosIds.length === 0) {
      return { success: false, message: 'No hay categorías nietas de Filtros' }
    }

    // 4. Obtener todas las relaciones producto-categoría para esos nietos
    const relations = await CategoryProduct.query().whereIn('category_id', nietosIds)

    // 5. Limpiar tabla filters_products (opcional, si quieres reemplazar todo)
    await FiltersProduct.truncate()

    // 6. Guardar las relaciones en filters_products
    if (relations.length > 0) {
      await FiltersProduct.createMany(
        relations.map(rel => ({
          product_id: rel.product_id,
          category_id: rel.category_id
        }))
      )
    }

    return {
      success: true,
      message: `Sincronizadas ${relations.length} relaciones en filters_products (nietos de Filtros)`
    }
  }
} 