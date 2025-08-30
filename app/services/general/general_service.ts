import CatalogSafeStock from '#models/catalog.safe.stock'
import Env from '#start/env'
import BigCommerceService from '#services/bigcommerce_service'
import PriceService from '#services/price_service'
import InventoryService from '#services/inventory_service'
import {
  FormattedOption,
  FormattedProductOption,
  FormattedVariant,
  ProductImage,
  ProductOption,
  ProductVariant,
  Product,
  SafeStockItem,
  OptionValue,
} from '#services/general/interfaces/general_interfaces'

export class GeneralService {
  private static bigCommerceService = new BigCommerceService()

  /**
   * Calcula el porcentaje de descuento
   */
  static async calculateDiscount(price = 0, sale_price = 0): Promise<string> {
    if (price === 0 || sale_price === 0) {
      return '0%'
    }

    let percent = (sale_price * 100) / price
    percent = Math.round(100 - percent)

    if (percent >= 0 && percent < 100) {
      return percent + '%'
    }

    return '0%'
  }

  /**
   * Calcula el precio de transferencia
   */
  static async calculateTranferPrice(
    price = 0,
    sale_price = 0,
    percentTrasnfer = 2
  ): Promise<number> {
    if (price === 0 && sale_price === 0) {
      return 0
    }
    if (sale_price !== 0) {
      const discountAmount = sale_price * (percentTrasnfer / 100)
      return Math.round(sale_price - discountAmount)
    } else {
      const discountAmount = price * (percentTrasnfer / 100)
      return Math.round(price - discountAmount)
    }
  }

  /**
   * Obtiene la imagen miniatura del producto
   */
  static async getThumbnailByProducts(images: ProductImage[]): Promise<string | undefined> {
    let thumbnail: string | undefined
    await Promise.all(
      images.map(async function (elem: ProductImage) {
        if (elem.is_thumbnail === true) {
          thumbnail = elem.url_standard
        }
      })
    )
    return thumbnail
  }

  /**
   * Obtiene la imagen hover del producto
   */
  static async getHoverByProducts(images: ProductImage[]): Promise<string | undefined> {
    let hover: string | undefined
    await Promise.all(
      images.map(async function (elem: ProductImage) {
        if (elem.description.includes('hover')) {
          hover = elem.url_standard
        }
      })
    )
    return hover
  }

  /**
   * Obtiene las imágenes del producto por variación
   */
  static async getImagesByVariation(
    images: ProductImage[],
    sku: string,
    thumb: string
  ): Promise<string[]> {
    let arrayImages: string[] = []
    arrayImages.push(thumb)
    await Promise.all(
      images
        .sort((a: ProductImage, b: ProductImage) => a.sort_order - b.sort_order)
        .map(async function (elem: ProductImage) {
          if (elem.description.includes(sku)) {
            let image = elem.url_zoom
            arrayImages.push(image)
          }
        })
    )
    return arrayImages
  }

  /**
   * Formatea los valores de las opciones del producto
   */
  static async getOptionsValues(options: OptionValue[]): Promise<FormattedOption[]> {
    let arrayOptions: FormattedOption[] = []
    await Promise.all(
      options.map(async function (elem: OptionValue) {
        let valueData = elem.value_data?.colors
          ? elem.value_data.colors
          : elem.value_data?.image_url
        let returnOptions = { id: elem.id, label: elem.label, value_data: valueData }
        arrayOptions.push(returnOptions)
      })
    )
    return arrayOptions
  }

  /**
   * Formatea los productos para la sincronización
   */
  static async FormatProductsArray(products: Product[]): Promise<any[]> {
    try {
      // 1. Obtener todos los SKUs únicos
      const skus = products.map((p) => p.variants[0].sku.trim())
      // 2. Traer todos los inventarios en una sola query
      const inventoryLevels = (await CatalogSafeStock.query()
        .whereIn('sku', skus)
        .pojo()) as SafeStockItem[]
      // 3. Crear un mapa para acceso rápido
      const inventoryMap = new Map(inventoryLevels.map((item) => [item.sku.trim(), item]))

      const productInfoArray = await Promise.all(
        products.map(async (product) => {
          try {
            const sku =
              product.variants && product.variants[0] ? product.variants[0].sku.trim() : ''
            const inventoryLevel = sku && inventoryMap.get(sku) ? [inventoryMap.get(sku)] : []

            const volumetric = (product.width * product.depth * product.height) / 4000
            let weight = volumetric > product.weight ? volumetric : product.weight
            weight = Env.get('COUNTRY_CODE') === 'PE' ? product.weight : weight

            return {
              id: product.id,
              image:
                (Array.isArray(product.images) &&
                  product.images.find((image: ProductImage) => image.is_thumbnail)?.url_standard) ||
                '',
              images: Array.isArray(product.images) ? [...product.images].reverse() : [],
              hover:
                (Array.isArray(product.images) &&
                  product.images.find((image: ProductImage) =>
                    image?.description?.includes('hover')
                  )?.url_standard) ||
                '',
              title: product.name,
              page_title: product.name,
              description: product.description,
              brand_id: product.brand_id,
              stock:
                inventoryLevel && inventoryLevel.length
                  ? inventoryLevel[0]?.available_to_sell || 0
                  : Math.max(
                      0,
                      product.inventory_level -
                        (typeof inventoryLevel?.[0]?.safety_stock === 'number'
                          ? inventoryLevel[0]?.safety_stock || 0
                          : 0)
                    ),
              warning_stock: inventoryLevel?.[0]?.safety_stock || 0,
              normal_price: product.price,
              discount_price: product.sale_price,
              cash_price: await GeneralService.calculateTranferPrice(
                product.price,
                product.sale_price,
                Number(Env.get('PERCENT_DISCOUNT_TRANSFER_PRICE'))
              ),
              percent: await GeneralService.calculateDiscount(product.price, product.sale_price),
              url: product.custom_url?.url ?? '/',
              type: product.variants && product.variants.length > 1 ? 'variation' : 'product',
              quantity: product.quantity ?? 0,
              armed_cost: 0,
              weight: weight,
              sort_order: product.sort_order,
              featured: product.is_featured,
              is_visible: product.is_visible,
              meta_keywords: Array.isArray(product.meta_keywords) ? product.meta_keywords : [],
              meta_description: product?.meta_description ?? '',
              reviews:
                typeof product.reviews === 'object' && product.reviews !== null
                  ? product.reviews
                  : null,
              sizes: Array.isArray(product.sizes) ? product.sizes : null,
            }
          } catch (err) {
            console.error(`[FormatProductsArray] Error en producto ID ${product.id}:`, err)
            return null
          }
        })
      )
      // Filtra los productos que fallaron
      return productInfoArray.filter(Boolean)
    } catch (error) {
      console.error('Error extracting product info:', error)
      return []
    }
  }

  /**
   * Formatea las opciones por variante del producto
   */
  static async formatOptionsByVariantByProduct(
    product: Product
  ): Promise<FormattedProductOption[]> {
    let data = await GeneralService.bigCommerceService.getVariantsOptionsOfProduct(product.id)

    if (!data || data.length === 0) {
      return []
    }

    let arrayOptions: FormattedProductOption[] = []
    await Promise.all(
      data.map(async function (elem: ProductOption) {
        let options = await GeneralService.getOptionsValues(elem.option_values)
        let finalOptions = options.sort((a, b) => a.id - b.id)
        let returnOptions = {
          id: elem.id,
          label: elem.display_name,
          product_id: elem.product_id,
          options: finalOptions,
        }
        arrayOptions.push(returnOptions)
      })
    )

    return arrayOptions
  }

  /**
   * Formatea las variantes del producto
   */
  static async formatVariantsByProduct(product: Product): Promise<FormattedVariant[]> {
    console.time(`formatVariantsByProduct - TOTAL (producto ${product.id})`)
    console.log(`🔄 Iniciando formatVariantsByProduct para producto ${product.id}`)

    console.time(`formatVariantsByProduct - getVariantsOfProduct (producto ${product.id})`)
    let data = await GeneralService.bigCommerceService.getVariantsOfProduct(product.id)
    console.timeEnd(`formatVariantsByProduct - getVariantsOfProduct (producto ${product.id})`)

    console.log(`📊 Producto ${product.id} - Procesando ${data.length} variantes`)

    let arrayVariants: FormattedVariant[] = []

    // Cache de inventario para evitar llamadas repetidas al mismo SKU
    const inventoryCache = new Map<string, any>()

    // Cache de CatalogSafeStock para evitar queries repetidas
    const safeStockCache = new Map<string, any>()

    // Batch query para CatalogSafeStock - obtener todos los SKUs de una vez
    console.time(`formatVariantsByProduct - batch CatalogSafeStock query (producto ${product.id})`)
    const skus = data.map((variant) => variant.sku)
    const safeStockBatch = await CatalogSafeStock.query().whereIn('sku', skus).pojo()

    // Crear cache con los resultados del batch
    safeStockBatch.forEach((item: any) => {
      safeStockCache.set(item.sku, item)
    })
    console.timeEnd(
      `formatVariantsByProduct - batch CatalogSafeStock query (producto ${product.id})`
    )
    console.log(
      `📦 Cache de CatalogSafeStock creado con ${safeStockBatch.length} registros para ${skus.length} SKUs`
    )

    // Procesar todas las variantes en paralelo
    const processedVariants = await Promise.all(
      data.map(async function (elem: ProductVariant, index: number) {
        console.time(`formatVariantsByProduct - variante ${elem.id} (${index + 1}/${data.length})`)

        try {
          console.time(`formatVariantsByProduct - variante ${elem.id} - PriceService`)
          const priceData = await PriceService.getPriceByVariantId(elem.id)
          console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - PriceService`)

          // Verificar si ya tenemos el inventario en cache
          let inventoryData
          if (inventoryCache.has(elem.sku)) {
            console.log(`📦 Cache hit para SKU ${elem.sku}`)
            inventoryData = inventoryCache.get(elem.sku)
          } else {
            console.time(`formatVariantsByProduct - variante ${elem.id} - InventoryService`)
            inventoryData = await InventoryService.getInventoryByVariantId(elem.id)
            console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - InventoryService`)

            // Guardar en cache para futuras variantes con el mismo SKU
            inventoryCache.set(elem.sku, inventoryData)
            console.log(`💾 Cache miss para SKU ${elem.sku} - guardado en cache`)
          }

          console.time(`formatVariantsByProduct - variante ${elem.id} - calculateDiscount`)
          const discountRate = await GeneralService.calculateDiscount(
            priceData?.price || 0,
            priceData?.calculatedPrice || 0
          )
          console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - calculateDiscount`)

          console.time(`formatVariantsByProduct - variante ${elem.id} - calculateTranferPrice`)
          const transferPrice = await GeneralService.calculateTranferPrice(
            priceData?.price || 0,
            priceData?.calculatedPrice || 0
          )
          console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - calculateTranferPrice`)

          console.time(`formatVariantsByProduct - variante ${elem.id} - cálculos volumétricos`)
          const volumetricWeight = Math.max(
            (elem.width * elem.depth * elem.height) / 6000,
            elem.calculated_weight
          )
          console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - cálculos volumétricos`)

          // Usar cache de CatalogSafeStock en lugar de query individual
          console.time(
            `formatVariantsByProduct - variante ${elem.id} - CatalogSafeStock cache lookup`
          )
          const safeStock = safeStockCache.get(elem.sku) || null
          console.timeEnd(
            `formatVariantsByProduct - variante ${elem.id} - CatalogSafeStock cache lookup`
          )

          console.time(`formatVariantsByProduct - variante ${elem.id} - getImagesByVariation`)
          const images = await GeneralService.getImagesByVariation(
            product.images || [],
            elem.sku,
            elem.image_url || ''
          )
          console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - getImagesByVariation`)

          console.time(`formatVariantsByProduct - variante ${elem.id} - getHoverImageByVariation`)
          const hoverImage = GeneralService.getHoverImageByVariation(product.images, elem.sku)
          console.timeEnd(
            `formatVariantsByProduct - variante ${elem.id} - getHoverImageByVariation`
          )

          console.time(`formatVariantsByProduct - variante ${elem.id} - crear objeto`)
          const variant: FormattedVariant = {
            id: elem.id,
            product_id: product.id,
            sku: elem.sku,
            type: product.name,
            image: images[0] || '',
            hover: hoverImage,
            stock: inventoryData?.availableToSell || 0,
            main_title: product.name,
            normal_price: priceData?.price || 0,
            discount_price: priceData?.calculatedPrice || 0,
            cash_price: transferPrice,
            discount_rate: discountRate,
            warning_stock: safeStock?.safety_stock || 0,
            images: images,
            quantity: inventoryData?.availableToSell || 0,
            armed_cost: 0, // No disponible en el modelo
            armed_quantity: 1, // Valor por defecto
            weight: volumetricWeight,
            height: elem.height,
            width: elem.width,
            depth: elem.depth,
            options: JSON.stringify(elem.option_values),
          }
          console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - crear objeto`)

          console.timeEnd(
            `formatVariantsByProduct - variante ${elem.id} (${index + 1}/${data.length})`
          )
          return variant
        } catch (error) {
          console.error(`❌ Error procesando variante ${elem.id}:`, error)
          console.timeEnd(
            `formatVariantsByProduct - variante ${elem.id} (${index + 1}/${data.length})`
          )
          return null
        }
      })
    )

    // Filtrar variantes que fallaron y asignar al array
    arrayVariants = processedVariants.filter((variant) => variant !== null) as FormattedVariant[]

    console.timeEnd(`formatVariantsByProduct - TOTAL (producto ${product.id})`)
    return arrayVariants
  }

  //obtener hover del producto por variacion
  static getHoverImageByVariation(images: ProductImage[], sku: string): string | undefined {
    const hoverImage = images.find(
      (elem) => elem.description.includes(sku) && elem.description.includes('hover')
    )
    return hoverImage?.url_standard
  }
}
