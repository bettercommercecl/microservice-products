import { BigcommerceProductVariant } from '#dto/bigcommerce/bigcommerce_product.dto'
import { ChannelConfigInterface } from '#interfaces/channel_interface'
import { FormattedProduct, FormattedVariantForModel } from '#interfaces/formatted_product.interface'
import CatalogSafeStock from '#models/catalog.safe.stock'
import Category from '#models/category'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import pLimit from 'p-limit'
import CalculationService from './calculation_service.js'
import CategoriesService from './categories_service.js'
import ImageProcessingService from './image_processing_service.js'
import PriceService from './price_service.js'
/**
 * Tipo para productos con variantes formateadas según el modelo
 */
type FormattedProductWithModelVariants = Omit<FormattedProduct, 'variants'> & {
  variants: FormattedVariantForModel[]
}

export default class FormatVariantsService {
  private readonly logger = Logger.child({ service: 'FormatVariantsService' })
  private readonly country = env.get('COUNTRY_CODE')
  private readonly priceService: PriceService
  private readonly calculationService: CalculationService
  private readonly imageProcessingService: ImageProcessingService
  private readonly categoriesService: CategoriesService
  // Constantes para valores por defecto
  private static readonly DEFAULT_PERCENT_DISCOUNT = 2
  private static readonly DEFAULT_INVENTORY = { available_to_sell: 0, safety_stock: 0 }
  private static readonly DEFAULT_PRICES = {
    normal_price: 0,
    discount_price: 0,
    cash_price: 0,
    discount_rate: '0%',
  }

  constructor() {
    this.priceService = new PriceService()
    this.calculationService = new CalculationService()
    this.imageProcessingService = new ImageProcessingService()
    this.categoriesService = new CategoriesService()
  }

  // ========================================
  // MÉTODOS PÚBLICOS PRINCIPALES
  // ========================================

  /**
   * Formatea las variantes de una lista de productos
   * @param productsList - Lista de productos con variantes
   * @param currentChannelConfig - Configuración del canal actual
   * @returns Lista de productos con variantes formateadas
   */
  async formatVariants(
    productsList: FormattedProduct[],
    currentChannelConfig: ChannelConfigInterface
  ): Promise<FormattedProductWithModelVariants[]> {
    // Control de concurrencia para evitar sobrecargar el microservicio de precios
    // Limitar a 10 variantes procesadas simultáneamente para evitar timeouts
    const limitConcurrency = pLimit(10)

    // Obtener todas las variantes de todos los productos
    const allVariants: Array<{
      variant: BigcommerceProductVariant
      product: FormattedProduct
      config: ChannelConfigInterface
    }> = []

    productsList.forEach((product) => {
      product.variants.forEach((variant) => {
        allVariants.push({ variant, product, config: currentChannelConfig })
      })
    })

    this.logger.info(
      {
        totalVariants: allVariants.length,
        totalProducts: productsList.length,
        concurrencyLimit: 10,
      },
      'Procesando variantes con control de concurrencia'
    )

    // Procesar todas las variantes con límite de concurrencia
    const formattedVariantsResults = await Promise.all(
      allVariants.map(({ variant, product, config }) =>
        limitConcurrency(() => this.processIndividualVariant(variant, product, config))
      )
    )

    // Agrupar variantes formateadas por producto
    const productsMap = new Map<number, FormattedVariantForModel[]>()
    let variantIndex = 0

    productsList.forEach((product) => {
      const productVariants: FormattedVariantForModel[] = []
      product.variants.forEach(() => {
        productVariants.push(formattedVariantsResults[variantIndex])
        variantIndex++
      })
      productsMap.set(product.product_id, productVariants)
    })

    // Construir respuesta con productos y sus variantes
    return productsList.map((product) => ({
      ...product,
      variants: productsMap.get(product.product_id) || [],
    }))
  }

  // ========================================
  // MÉTODOS DE PROCESAMIENTO DE VARIANTES
  // ========================================

  /**
   * Procesa una variante individual y la formatea para la base de datos
   * @param variant - Variante de Bigcommerce
   * @param product - Producto padre de la variante
   * @param config - Configuración del canal
   * @returns Variante formateada compatible con BigcommerceProductVariant
   */
  private async processIndividualVariant(
    variant: BigcommerceProductVariant,
    product: FormattedProduct,
    config: ChannelConfigInterface
  ): Promise<FormattedVariantForModel> {
    const { PERCENT_DISCOUNT_TRANSFER_PRICE } = config

    // Procesar datos con manejo de errores
    const processedData = await this.processVariantData(
      variant,
      product,
      PERCENT_DISCOUNT_TRANSFER_PRICE
    )

    // Construir objeto de la variante formateada
    return await this.buildFormattedVariant(variant, product, config, processedData)
  }

  // ========================================
  // MÉTODOS DE DATOS DE VARIANTES
  // ========================================

  /**
   * Obtiene el nivel de inventario de una variante específica
   * @param variant - Variante de Bigcommerce
   * @returns Array con los datos de inventario de la variante
   */
  private async getVariantInventoryLevel(
    variant: BigcommerceProductVariant
  ): Promise<Array<{ available_to_sell: number; safety_stock: number }>> {
    try {
      if (!variant.id) {
        throw new Error(`Variante sin ID para inventario`)
      }

      // Consultar el inventario en CatalogSafeStock
      const variantInventoryLevel = await CatalogSafeStock.query().where('variant_id', variant.id)

      // Verificar que se encontró inventario
      if (!variantInventoryLevel || variantInventoryLevel.length === 0) {
        throw new Error(`Sin inventario para SKU ${variant.sku} de la variante ${variant.id}`)
      }

      return variantInventoryLevel
    } catch (error) {
      this.logger.warn(
        {
          variant_id: variant.id,
          sku: variant.sku,
          error: error.message,
        },
        'Error obteniendo inventario para variante'
      )
      return [{ ...FormatVariantsService.DEFAULT_INVENTORY }]
    }
  }

  /**
   * 💰 Calcula los precios de una variante según el país
   * @param variant - Variante de Bigcommerce
   * @param _product - Producto padre (no usado actualmente)
   * @param PERCENT_DISCOUNT_TRANSFER_PRICE - Porcentaje de descuento para precio de transferencia
   * @returns Objeto con precios calculados
   */
  private async calculateVariantPrices(
    variant: BigcommerceProductVariant,
    _product: FormattedProduct,
    PERCENT_DISCOUNT_TRANSFER_PRICE: number
  ) {
    try {
      if (this.country === 'CL') {
        const discount = this.calculationService.calculateDiscount(
          variant.price,
          variant.sale_price || variant.calculated_price
        )
        const percentDiscount = this.calculationService.calculateTransferPrice(
          variant.price,
          variant.sale_price || variant.calculated_price,
          PERCENT_DISCOUNT_TRANSFER_PRICE
        )

        return {
          normal_price: variant.price,
          discount_price: variant.sale_price || variant.calculated_price,
          cash_price: percentDiscount,
          discount_rate: discount,
        }
      } else {
        const prices = await this.priceService.getPriceByVariantId(variant.id)

        // Validar que PriceService devolvió datos válidos
        if (!prices || !prices.price || !prices.calculatedPrice) {
          throw new Error(`PriceService sin datos para variante ${variant.id}`)
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
          discount_rate: discount,
        }
      }
    } catch (error) {
      this.logger.warn(
        {
          variant_id: variant.id,
          sku: variant.sku,
          error: error.message,
        },
        'Sin datos de precios para variante'
      )
      return { ...FormatVariantsService.DEFAULT_PRICES }
    }
  }

  /**
   * Procesa los datos asíncronos de la variante (inventario, precios)
   * @param variant - Variante de Bigcommerce
   * @param product - Producto padre
   * @param percentDiscount - Porcentaje de descuento
   * @returns Objeto con los datos procesados
   */
  private async processVariantData(
    variant: BigcommerceProductVariant,
    product: FormattedProduct,
    percentDiscount: number | null
  ) {
    let inventoryLevel: Array<{ available_to_sell: number; safety_stock: number }> = []
    let prices = { ...FormatVariantsService.DEFAULT_PRICES }

    try {
      inventoryLevel = await this.getVariantInventoryLevel(variant)
      prices = await this.calculateVariantPrices(
        variant,
        product,
        percentDiscount || FormatVariantsService.DEFAULT_PERCENT_DISCOUNT
      )
    } catch (error) {
      this.logger.warn(
        {
          variant_id: variant.id,
          sku: variant.sku,
          error: error.message,
        },
        'Error procesando datos de la variante'
      )
      // Los valores por defecto ya están asignados arriba
    }

    return {
      inventoryLevel,
      prices,
    }
  }

  // ========================================
  // MÉTODOS DE KEYWORDS Y CATEGORÍAS
  // ========================================

  /**
   * Genera keywords basados en categorías, tags y campañas del producto
   * @param product - Producto con sus categorías
   * @param config - Configuración del canal
   * @returns String con keywords separados por comas
   */
  private async generateKeywords(
    product: FormattedProduct,
    config: ChannelConfigInterface
  ): Promise<string> {
    try {
      // 1. OBTENER CATEGORÍAS HIJAS DE BENEFICIOS Y CAMPAÑAS
      const [childTags, childCampaigns] = await Promise.all([
        config.ID_BENEFITS ? this.categoriesService.getChildCategories(config.ID_BENEFITS) : [],
        config.ID_CAMPAIGNS ? this.categoriesService.getChildCategories(config.ID_CAMPAIGNS) : [],
      ])

      // 2. PROCESAR CATEGORÍAS DEL PRODUCTO
      let categoryIds: number[] = []
      if (product.categories) {
        try {
          // Parsear si viene como string JSON
          const categories =
            typeof product.categories === 'string'
              ? JSON.parse(product.categories)
              : product.categories

          categoryIds = Array.isArray(categories)
            ? categories.map((cat: any) => cat.category_id || cat)
            : []
        } catch (error) {
          this.logger.warn(
            {
              product_id: product.product_id,
              categories: product.categories,
              error: error.message,
            },
            'Error parseando categorías del producto'
          )
        }
      }

      let categoryTitles: string[] = []
      if (categoryIds.length > 0) {
        // Usar cache para evitar queries repetidas
        const categoryCache = new Map<number, string>()
        const uncachedIds = categoryIds.filter((id) => !categoryCache.has(id))

        if (uncachedIds.length > 0) {
          const categoryRecords = await Category.query().whereIn('category_id', uncachedIds)
          categoryRecords.forEach((cat) => {
            categoryCache.set(cat.category_id, cat.title)
          })
        }

        categoryTitles = categoryIds
          .map((id) => categoryCache.get(id))
          .filter((title): title is string => Boolean(title))
      }

      // 3. QUERIES DE TAGS/CAMPAIGNS
      const [tags, campaigns] = await Promise.all([
        childTags.length > 0
          ? this.categoriesService.getCampaignsByCategory(product.product_id, childTags)
          : [],
        childCampaigns.length > 0
          ? this.categoriesService.getCampaignsByCategory(product.product_id, childCampaigns)
          : [],
      ])

      // 4. COMBINAR TODOS LOS KEYWORDS
      const keywords = [...categoryTitles, ...tags, ...campaigns].filter(Boolean).join(', ')
      return keywords
    } catch (error) {
      this.logger.warn(
        {
          product_id: product.product_id,
          error: error.message,
        },
        'Error generando keywords para producto'
      )
      return ''
    }
  }

  // ========================================
  // 🏗️ MÉTODOS DE CONSTRUCCIÓN DE OBJETOS
  // ========================================

  /**
   * 🏗️ Construye el objeto de la variante formateada
   * @param variant - Variante de Bigcommerce
   * @param product - Producto padre
   * @param processedData - Datos procesados de la variante
   * @returns Variante formateada compatible con BigcommerceProductVariant
   */
  private async buildFormattedVariant(
    variant: BigcommerceProductVariant,
    product: FormattedProduct,
    config: ChannelConfigInterface,
    processedData: {
      inventoryLevel: Array<{ available_to_sell: number; safety_stock: number }>
      prices: {
        normal_price: number
        discount_price: number
        cash_price: number
        discount_rate: string
      }
    }
  ): Promise<FormattedVariantForModel> {
    const { inventoryLevel, prices } = processedData

    // Verificar si los precios son 0 para marcar como no visible
    const hasZeroPrices = prices.normal_price === 0 && prices.discount_price === 0
    const calculatedWeight = this.calculationService.calculateVolumetricWeight(
      variant.width,
      variant.depth,
      variant.height,
      variant.weight !== null ? variant.weight : product.weight || 0,
      this.country
    )
    const images = this.imageProcessingService.getImagesByVariation(
      product.images ? JSON.parse(product.images) : [],
      variant.sku,
      variant.image_url
    )

    // Obtener imagen hover para la variante
    const hoverImage = this.imageProcessingService.getHoverImageByVariation(
      product.images ? JSON.parse(product.images) : [],
      variant.sku
    )

    // Generar keywords basados en las categorías del producto
    const keywords = await this.generateKeywords(product, config)

    // 🎨 Generar título mejorado con opciones de Color y Size
    // const enhancedTitle = this.generateEnhancedTitle(product.title, variant.option_values)

    return {
      // Campos del modelo Variant.ts
      id: variant.id,
      product_id: product.product_id,
      title: product.title,
      sku: variant.sku,
      normal_price: prices.normal_price,
      discount_price: prices.discount_price,
      cash_price: prices.cash_price,
      discount_rate: prices.discount_rate,
      stock: inventoryLevel[0]?.available_to_sell || 0,
      warning_stock: inventoryLevel[0]?.safety_stock || 0,
      image: variant.image_url || product.image,
      images: JSON.stringify(images),
      hover: hoverImage || null,
      categories: product.categories,
      quantity: variant.inventory_level,
      armed_cost: 0,
      armed_quantity: 1,
      weight: calculatedWeight,
      height: variant.height,
      depth: variant.depth,
      width: variant.width,
      type: 'variant',
      options: variant.option_values.length ? JSON.stringify(variant.option_values) : null,
      related_products: product.related_products ? product.related_products : null,
      option_label: variant.option_values?.[0]?.label || null,
      keywords: keywords,
      is_visible: hasZeroPrices ? false : product.is_visible,
    }
  }

  /**
   * 🎨 Genera un título mejorado concatenando las opciones de Color y Size
   * @param baseTitle - Título base del producto
   * @param optionValues - Array de opciones de la variante
   * @returns Título mejorado con opciones de Color y Size
   */
  // private generateEnhancedTitle(baseTitle: string, optionValues: any[]): string {
  //   if (!optionValues || optionValues.length === 0) {
  //     return baseTitle
  //   }

  //   const colorOption = optionValues.find((option) => option.option_display_name === 'Color')
  //   const sizeOption = optionValues.find((option) => option.option_display_name === 'Size')

  //   let enhancedTitle = baseTitle
  //   const options = []

  //   // Agregar Color si existe
  //   if (colorOption && colorOption.label) {
  //     options.push(`Color: ${colorOption.label}`)
  //   }

  //   // Agregar Size si existe
  //   if (sizeOption && sizeOption.label) {
  //     options.push(`Size: ${sizeOption.label}`)
  //   }

  //   // Concatenar opciones al título base
  //   if (options.length > 0) {
  //     enhancedTitle += ` - ${options.join(' - ')}`
  //   }

  //   return enhancedTitle
  // }
}
