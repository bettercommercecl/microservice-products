import { BigcommerceProduct } from '#dto/bigcommerce/bigcommerce_product.dto'
import { ChannelConfigInterface } from '#interfaces/channel_interface'
import { FormattedProduct } from '#interfaces/formatted_product.interface'
import CatalogSafeStock from '#models/catalog.safe.stock'
import Logger from '@adonisjs/core/services/logger'
import env from '#start/env'
import { DateTime } from 'luxon'
import CategoriesService from './categories_service.js'
import BigcommerceService from './bigcommerce_service.js'
import CalculationService from './calculation_service.js'
import PriceService from './price_service.js'

export default class FormatProductsService {
  private readonly logger = Logger.child({ service: 'FormatProductsService' })
  private readonly country = env.get('COUNTRY_CODE')
  private readonly categoriesService: CategoriesService
  private readonly bigcommerceService: BigcommerceService
  private readonly priceService: PriceService
  private readonly calculationService: CalculationService

  // Constantes para valores por defecto
  private static readonly DEFAULT_PERCENT_DISCOUNT = 2
  private static readonly DEFAULT_INVENTORY = { available_to_sell: 0, safety_stock: 0 }
  private static readonly DEFAULT_TIMER_METAFIELDS = {
    timer_status: false,
    timer_price: 0,
    timer_datetime: null as DateTime | null,
  }
  private static readonly DEFAULT_PRICES = {
    normal_price: 0,
    discount_price: 0,
    cash_price: 0,
    percent: '0%',
  }

  constructor() {
    this.categoriesService = new CategoriesService()
    this.bigcommerceService = new BigcommerceService()
    this.priceService = new PriceService()
    this.calculationService = new CalculationService()
  }
  async formatProducts(
    productsList: BigcommerceProduct[],
    currentChannelConfig: ChannelConfigInterface
  ): Promise<FormattedProduct[]> {
    // Usar configuración del canal directamente

    // Procesar todos los productos en paralelo
    const products = await Promise.all(
      productsList.map(async (product) => {
        return await this.processIndividualProduct(product, currentChannelConfig)
      })
    )

    return products
  }

  /**
   * Procesa un producto individual y lo formatea para la base de datos
   * @param product - Producto de Bigcommerce
   * @param config - Configuración del canal
   * @returns Producto formateado
   */
  private async processIndividualProduct(
    product: BigcommerceProduct,
    config: ChannelConfigInterface
  ): Promise<FormattedProduct> {
    const { PERCENT_DISCOUNT_TRANSFER_PRICE, ID_RESERVE } = config

    // Procesar categorías especiales
    const reserve = await this.identifyIsProductReserve(product.categories, ID_RESERVE)
    const specialCategories = this.processSpecialCategories(product, config)
    const sizes = this.getSizesByProduct(product.categories, config)

    // Obtener datos asíncronos
    const reviews = await this.getReviewsByProduct(product.id)
    const quantity = product.variants.reduce((acc, variant) => acc + variant.inventory_level, 0)

    // Procesar datos con manejo de errores
    const processedData = await this.processProductData(product, PERCENT_DISCOUNT_TRANSFER_PRICE)

    // Construir objeto del producto formateado
    return this.buildFormattedProduct(product, {
      reserve,
      reviews,
      quantity,
      specialCategories,
      processedData,
      sizes,
    })
  }

  private async identifyIsProductReserve(categories: number[], categoryId: number | null) {
    try {
      // Verificar si el producto tiene la categoría de reserva
      const reserve = categoryId !== null ? categories.includes(categoryId) : false

      if (!reserve) {
        return ''
      }

      // Obtener fecha de reserva
      let childReserve: any = reserve
        ? await this.categoriesService.getDateReserve(categoryId as number)
        : null
      const isReserve =
        childReserve !== null
          ? childReserve.filter((item: any) => categories.includes(item.category_id))
          : null
      const dateReserve = isReserve && isReserve.length ? isReserve[0].title : null

      return dateReserve || ''
    } catch (error) {
      this.logger.warn(
        {
          error: error.message,
        },
        'Error identificando si el producto es de reserva'
      )
      return ''
    }
  }

  /**
   * Obtiene el nivel de inventario del producto basado en el SKU de su primera variante
   * @param product - Producto de Bigcommerce con sus variantes
   * @returns Array con los datos de inventario del SKU
   */
  private async getProductInventoryLevel(
    product: BigcommerceProduct
  ): Promise<Array<{ available_to_sell: number; safety_stock: number }>> {
    try {
      if (!product.id) {
        throw new Error(`Producto ${product.id} sin SKU para inventario`)
      }

      // Consultar el inventario en CatalogSafeStock
      const inventoryLevel = await CatalogSafeStock.query().where('product_id', product.id)

      // Verificar que se encontró inventario
      if (!inventoryLevel || inventoryLevel.length === 0) {
        throw new Error(`Sin inventario para SKU ${product.id} del producto ${product.id}`)
      }

      // Unificar y sumar los campos de inventario de todos los registros
      const resultInventory = inventoryLevel.reduce(
        (acc, item) => ({
          available_to_sell: (acc.available_to_sell || 0) + (item.available_to_sell || 0),
          safety_stock: (acc.safety_stock || 0) + (item.safety_stock || 0),
        }),
        { available_to_sell: 0, safety_stock: 0 }
      )

      return [resultInventory]
    } catch (error) {
      this.logger.warn(
        {
          product_id: product.id,
          error: error.message,
        },
        'Error obteniendo inventario para producto'
      )
      return [{ ...FormatProductsService.DEFAULT_INVENTORY }]
    }
  }

  /**
   * Obtiene los metafields del timer del producto basado en el país
   * @param productId - ID del producto en Bigcommerce
   * @returns Objeto con timer_status, timer_price y timer_datetime
   */
  private async getProductTimerMetafields(productId: number): Promise<{
    timer_status: boolean
    timer_price: number
    timer_datetime: DateTime | null
  }> {
    try {
      // Determinar el nombre del metafield según el país
      const titleMetafieldTimerByCountry =
        this.country === 'CL'
          ? 'timer_product'
          : this.country === 'CO'
            ? 'timer_product_co'
            : 'timer_product_pe'

      // Obtener el metafield del timer desde Bigcommerce
      let timerMetafield = await this.bigcommerceService.getMetafieldsByProduct(
        productId,
        titleMetafieldTimerByCountry
      )

      // Parsear el JSON si existe
      timerMetafield = timerMetafield.length ? JSON.parse(timerMetafield) : null

      // Si no hay metafield o está vacío, devolver valores por defecto
      if (!timerMetafield || typeof timerMetafield !== 'object') {
        return { ...FormatProductsService.DEFAULT_TIMER_METAFIELDS }
      }

      // Extraer los valores del timer
      const timerPrice = timerMetafield.timer_price || 0
      const timerStatus = Boolean(timerMetafield.timer_status)
      const timerDatetime = timerMetafield.timer_datetime
        ? DateTime.fromJSDate(new Date(timerMetafield.timer_datetime))
        : null

      return {
        timer_status: timerStatus,
        timer_price: timerPrice,
        timer_datetime: timerDatetime,
      }
    } catch (error) {
      this.logger.warn(
        {
          product_id: productId,
          country: this.country,
          error: error.message,
        },
        'Error obteniendo timer metafields para producto'
      )
      return { ...FormatProductsService.DEFAULT_TIMER_METAFIELDS }
    }
  }
  private async calculatePricesProduct(
    product: BigcommerceProduct,
    PERCENT_DISCOUNT_TRANSFER_PRICE: number
  ) {
    try {
      if (this.country === 'CL') {
        const discount = this.calculationService.calculateDiscount(
          product.price,
          product.sale_price
        )
        const percentDiscount = this.calculationService.calculateTransferPrice(
          product.price,
          product.sale_price,
          PERCENT_DISCOUNT_TRANSFER_PRICE
        )

        return {
          normal_price: product.price,
          discount_price: product.sale_price,
          cash_price: percentDiscount,
          percent: discount,
        }
      } else {
        // Verificar que el producto tenga variantes antes de consultar precios
        if (!product.variants || product.variants.length === 0) {
          throw new Error(`Producto ${product.id} sin variantes`)
        }

        const prices = await this.priceService.getPriceByVariantId(product.variants[0].id)

        // Validar que PriceService devolvió datos válidos
        if (!prices || !prices.price || !prices.calculatedPrice) {
          throw new Error(`PriceService sin datos para producto ${product.id}`)
        }

        // Usar precios de PriceService si están disponibles
        const discount = this.calculationService.calculateDiscount(
          prices.price,
          prices.calculatedPrice
        )
        const percentDiscount = this.calculationService.calculateTransferPrice(
          prices.price,
          prices.calculatedPrice,
          PERCENT_DISCOUNT_TRANSFER_PRICE
        )
        return {
          normal_price: prices.price,
          discount_price: prices.calculatedPrice,
          cash_price: percentDiscount,
          percent: discount,
        }
      }
    } catch (error) {
      this.logger.warn(
        {
          product_id: product.id,
          error: error.message,
        },
        'Sin datos de precios para producto'
      )
      return { ...FormatProductsService.DEFAULT_PRICES }
    }
  }

  private async getReviewsByProduct(productId: number) {
    try {
      const reviews = await this.bigcommerceService.getReviewsByProduct(productId)
      return reviews?.product_id ? reviews : null
    } catch (error) {
      // Solo logear errores críticos, no warnings masivos
      if (error.message.includes('404') || error.message.includes('not found')) {
        return null
      }

      this.logger.error(
        {
          product_id: productId,
          error: error.message,
        },
        'Error crítico obteniendo reviews'
      )
      return null
    }
  }

  /**
   * Procesa las categorías especiales del producto
   * @param product - Producto de Bigcommerce
   * @param config - Configuración del canal
   * @returns Objeto con las categorías especiales procesadas
   */
  private processSpecialCategories(product: BigcommerceProduct, config: ChannelConfigInterface) {
    return {
      sameday: config.ID_SAMEDAY !== null ? product.categories.includes(config.ID_SAMEDAY) : false,
      despacho24horas:
        config.ID_24HORAS !== null ? product.categories.includes(config.ID_24HORAS) : false,
      pickupInStore:
        config.ID_PICKUP_IN_STORE !== null
          ? product.categories.includes(config.ID_PICKUP_IN_STORE)
          : false,
      turbo: config.ID_TURBO !== null ? product.categories.includes(config.ID_TURBO) : false,
      freeShipping:
        config.ID_FREE_SHIPPING !== null
          ? product.categories.includes(config.ID_FREE_SHIPPING)
          : false,
    }
  }
  getSizesByProduct(categories: number[], config: ChannelConfigInterface) {
    const jsonStores = {
      napoleon: {
        small: config.ID_SMALL_NAPOLEON ? categories.includes(config.ID_SMALL_NAPOLEON) : false,
        medium: config.ID_MEDIUM_NAPOLEON ? categories.includes(config.ID_MEDIUM_NAPOLEON) : false,
        big: config.ID_BIG_NAPOLEON ? categories.includes(config.ID_BIG_NAPOLEON) : false,
      },
      vitacura: {
        small: config.ID_SMALL_VITACURA ? categories.includes(config.ID_SMALL_VITACURA) : false,
        medium: config.ID_MEDIUM_VITACURA ? categories.includes(config.ID_MEDIUM_VITACURA) : false,
        big: config.ID_BIG_VITACURA ? categories.includes(config.ID_BIG_VITACURA) : false,
      },
      condor: {
        small: config.ID_SMALL_CONDOR ? categories.includes(config.ID_SMALL_CONDOR) : false,
        medium: config.ID_MEDIUM_CONDOR ? categories.includes(config.ID_MEDIUM_CONDOR) : false,
        big: config.ID_BIG_CONDOR ? categories.includes(config.ID_BIG_CONDOR) : false,
      },
      quilicura: {
        small: config.ID_SMALL_QUILICURA ? categories.includes(config.ID_SMALL_QUILICURA) : false,
        medium: config.ID_MEDIUM_QUILICURA
          ? categories.includes(config.ID_MEDIUM_QUILICURA)
          : false,
        big: config.ID_BIG_QUILICURA ? categories.includes(config.ID_BIG_QUILICURA) : false,
      },
      vina: {
        small: config.ID_SMALL_VINA ? categories.includes(config.ID_SMALL_VINA) : false,
        medium: config.ID_MEDIUM_VINA ? categories.includes(config.ID_MEDIUM_VINA) : false,
        big: config.ID_BIG_VINA ? categories.includes(config.ID_BIG_VINA) : false,
      },
      concon: {
        small: config.ID_SMALL_CONCON ? categories.includes(config.ID_SMALL_CONCON) : false,
        medium: config.ID_MEDIUM_CONCON ? categories.includes(config.ID_MEDIUM_CONCON) : false,
        big: config.ID_BIG_CONCON ? categories.includes(config.ID_BIG_CONCON) : false,
      },
      concepcion: {
        small: config.ID_SMALL_CONCEPCION ? categories.includes(config.ID_SMALL_CONCEPCION) : false,
        medium: config.ID_MEDIUM_CONCEPCION
          ? categories.includes(config.ID_MEDIUM_CONCEPCION)
          : false,
        big: config.ID_BIG_CONCEPCION ? categories.includes(config.ID_BIG_CONCEPCION) : false,
      },
      retirocondes: {
        small: config.ID_SMALL_RETIROCONDES
          ? categories.includes(config.ID_SMALL_RETIROCONDES)
          : false,
        medium: config.ID_MEDIUM_RETIROCONDES
          ? categories.includes(config.ID_MEDIUM_RETIROCONDES)
          : false,
        big: config.ID_BIG_RETIROCONDES ? categories.includes(config.ID_BIG_RETIROCONDES) : false,
      },
      condes: {
        small: config.ID_SMALL_FORCES ? categories.includes(config.ID_SMALL_FORCES) : false,
        medium: config.ID_MEDIUM_FORCES ? categories.includes(config.ID_MEDIUM_FORCES) : false,
        big: config.ID_BIG_FORCES ? categories.includes(config.ID_BIG_FORCES) : false,
      },
      buenaventura: {
        small: config.ID_SMALL_BUENAVENTURA
          ? categories.includes(config.ID_SMALL_BUENAVENTURA)
          : false,
        medium: config.ID_MEDIUM_BUENAVENTURA
          ? categories.includes(config.ID_MEDIUM_BUENAVENTURA)
          : false,
        big: config.ID_BIG_BUENAVENTURA ? categories.includes(config.ID_BIG_BUENAVENTURA) : false,
      },
      urbano: {
        small: config.ID_SMALL_URBANO ? categories.includes(config.ID_SMALL_URBANO) : false,
        medium: config.ID_MEDIUM_URBANO ? categories.includes(config.ID_MEDIUM_URBANO) : false,
        big: config.ID_BIG_URBANO ? categories.includes(config.ID_BIG_URBANO) : false,
      },
      surco: {
        small: config.ID_SMALL_SURCO ? categories.includes(config.ID_SMALL_SURCO) : false,
        medium: config.ID_MEDIUM_SURCO ? categories.includes(config.ID_MEDIUM_SURCO) : false,
        big: config.ID_BIG_SURCO ? categories.includes(config.ID_BIG_SURCO) : false,
      },
      miraflores: {
        small: config.ID_SMALL_MIRAFLORES ? categories.includes(config.ID_SMALL_MIRAFLORES) : false,
        medium: config.ID_MEDIUM_MIRAFLORES
          ? categories.includes(config.ID_MEDIUM_MIRAFLORES)
          : false,
        big: config.ID_BIG_MIRAFLORES ? categories.includes(config.ID_BIG_MIRAFLORES) : false,
      },
      sanmiguel: {
        small: config.ID_SMALL_SANMIGUEL ? categories.includes(config.ID_SMALL_SANMIGUEL) : false,
        medium: config.ID_MEDIUM_SANMIGUEL
          ? categories.includes(config.ID_MEDIUM_SANMIGUEL)
          : false,
        big: config.ID_BIG_SANMIGUEL ? categories.includes(config.ID_BIG_SANMIGUEL) : false,
      },
      sanjuan: {
        small: config.ID_SMALL_SANJUAN ? categories.includes(config.ID_SMALL_SANJUAN) : false,
        medium: config.ID_MEDIUM_SANJUAN ? categories.includes(config.ID_MEDIUM_SANJUAN) : false,
        big: config.ID_BIG_SANJUAN ? categories.includes(config.ID_BIG_SANJUAN) : false,
      },
    }
    return jsonStores
  }
  /**
   * Procesa los datos asíncronos del producto (inventario, timer, precios)
   * @param product - Producto de Bigcommerce
   * @param percentDiscount - Porcentaje de descuento
   * @returns Objeto con los datos procesados
   */
  private async processProductData(product: BigcommerceProduct, percentDiscount: number | null) {
    let inventoryLevel: Array<{ available_to_sell: number; safety_stock: number }> = []
    let timerMetafields = { ...FormatProductsService.DEFAULT_TIMER_METAFIELDS }
    let prices = { ...FormatProductsService.DEFAULT_PRICES }

    try {
      inventoryLevel = await this.getProductInventoryLevel(product)
      timerMetafields = await this.getProductTimerMetafields(product.id)
      prices = await this.calculatePricesProduct(
        product,
        percentDiscount || FormatProductsService.DEFAULT_PERCENT_DISCOUNT
      )
    } catch (error) {
      this.logger.warn(
        {
          product_id: product.id,
          error: error.message,
        },
        'Error procesando datos del producto'
      )
      // Los valores por defecto ya están asignados arriba
    }

    return {
      inventoryLevel,
      timerMetafields,
      prices,
    }
  }

  /**
   * 🏗️ Construye el objeto del producto formateado
   * @param product - Producto de Bigcommerce
   * @param data - Datos procesados del producto
   * @returns Producto formateado listo para la base de datos
   */
  private buildFormattedProduct(
    product: BigcommerceProduct,
    data: {
      reserve: string
      reviews: any
      quantity: number
      specialCategories: any
      processedData: any
      sizes: any
    }
  ): FormattedProduct {
    const { reserve, reviews, quantity, specialCategories, processedData, sizes } = data
    const { inventoryLevel, timerMetafields, prices } = processedData

    // Verificar si los precios son 0 para marcar como no visible
    const hasZeroPrices = prices.normal_price === 0 && prices.discount_price === 0

    return {
      id: product.id,
      product_id: product.id,
      title: product.name,
      description: product.description,
      type: product.variants.length > 1 ? 'variation' : 'product',
      brand_id: product.brand_id,
      categories: JSON.stringify(product.categories),
      image: product.images.find((image) => image.is_thumbnail)?.url_standard || '',
      images: product.images.length > 0 ? JSON.stringify(product.images) : null,
      hover:
        product.images.find((image) => image?.description?.includes('hover'))?.url_standard || '',
      page_title: product.name,
      url: product.custom_url?.url ?? '/',
      quantity: this.country === 'CL' ? quantity : inventoryLevel[0]?.available_to_sell,
      ...prices,
      reserve,
      reviews: reviews ? JSON.stringify(reviews) : null,
      sameday: specialCategories.sameday,
      despacho24horas: specialCategories.despacho24horas,
      pickup_in_store: specialCategories.pickupInStore,
      turbo: specialCategories.turbo,
      free_shipping: specialCategories.freeShipping,
      stock: inventoryLevel[0]?.available_to_sell || 0,
      warning_stock: inventoryLevel[0]?.safety_stock || 0,
      timer_status: timerMetafields.timer_status || false,
      timer_price: timerMetafields.timer_price || 0,
      timer_datetime: timerMetafields.timer_datetime,
      total_sold: product.total_sold,
      weight: product.weight || 0,
      armed_cost: 0,
      related_products: JSON.stringify(product.related_products),
      featured: product.is_featured,
      is_visible: hasZeroPrices ? false : product.is_visible,
      variants: product.variants,
      // Campos requeridos por la migración
      meta_description: product.meta_description || product.description.substring(0, 160),
      meta_keywords: JSON.stringify(product.meta_keywords) || null,
      sizes: JSON.stringify(sizes),
      sort_order: product.sort_order || 0,
    }
  }
}
