import CatalogSafeStock from '#models/CatalogSafeStock'
import Env from '#start/env'
import BigCommerceService from './BigCommerceService.js'

interface ProductImage {
  is_thumbnail: boolean
  url_standard: string
  url_zoom: string
  description: string
  sort_order: number
}

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

interface Product {
  id: number
  name: string
  description: string
  brand_id: number
  categories: number[]
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
  images: ProductImage[]
  variants: ProductVariant[]
  reviews?: any
  sizes?: any
}

interface OptionValue {
  id: number
  label: string
  value_data?: {
    colors?: any
    image_url?: string
  }
}

interface ProductOption {
  id: number
  display_name: string
  product_id: number
  option_values: OptionValue[]
}

interface FormattedOption {
  id: number
  label: string
  value_data: any
}

interface FormattedProductOption {
  id: number
  label: string
  product_id: number
  options: FormattedOption[]
}

interface FormattedVariant {
  id: number
  product_id: number
  sku: string
  type: string
  image: string
  hover?: string
  stock: number
  main_title: string
  normal_price: number
  discount_price: number
  cash_price: number
  discount_rate: string
  warning_stock: number
  images: string[]
  quantity: number
  armed_cost: number
  armed_quantity: number
  weight: number
  height: number
  width: number
  depth: number
  options?: string
}

interface SafeStockItem {
  id: number
  product_id: number
  sku: string
  variant_id: number | null
  safety_stock: number
  warning_level: number
  available_to_sell: number
  bin_picking_number: string | null
  createdAt: Date
  updatedAt: Date
}

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
        let value_data = elem.value_data?.colors
          ? elem.value_data.colors
          : elem.value_data?.image_url
        let returnOptions = { id: elem.id, label: elem.label, value_data: value_data }
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
      const productInfoArray = await Promise.all(
        products.map(async (product) => {
          const sku = product.variants[0].sku
          const inventoryLevel = (await CatalogSafeStock.query()
            .where('sku', sku.trim())
            .pojo()) as SafeStockItem[]

          const volumetric = (product.width * product.depth * product.height) / 4000
          let weight = volumetric > product.weight ? volumetric : product.weight
          weight = Env.get('COUNTRY_CODE') === 'PE' ? product.weight : weight

          return {
            id: product.id,
            image:
              product.images.find((image: ProductImage) => image.is_thumbnail)?.url_standard || '',
            images: Array.isArray(product.images) ? [...product.images].reverse() : [],
            hover:
              product.images.find((image: ProductImage) => image?.description?.includes('hover'))
                ?.url_standard || '',
            title: product.name,
            page_title: product.name,
            description: product.description,
            brand_id: product.brand_id,
            stock:
              inventoryLevel && inventoryLevel.length
                ? inventoryLevel[0].available_to_sell
                : Math.max(
                    0,
                    product.inventory_level -
                      (typeof inventoryLevel[0]?.safety_stock === 'number'
                        ? inventoryLevel[0].safety_stock
                        : 0)
                  ),
            warning_stock: inventoryLevel[0]?.safety_stock || 0,
            normal_price: product.price,
            discount_price: product.sale_price,
            cash_price: await GeneralService.calculateTranferPrice(
              product.price,
              product.sale_price,
              Number(Env.get('PERCENT_DISCOUNT_TRANSFER_PRICE'))
            ),
            percent: await GeneralService.calculateDiscount(product.price, product.sale_price),
            url: product.custom_url?.url ?? '/',
            type: product.variants.length > 1 ? 'variation' : 'product',
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
        })
      )
      return productInfoArray
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
    let data = await GeneralService.bigCommerceService.getVariantsOfProduct(product.id)
    let arrayVariants: FormattedVariant[] = []
    await Promise.all(
      data.map(async function (elem: ProductVariant) {
        let price = elem.sale_price !== null ? elem.sale_price : elem.calculated_price
        let discount = await GeneralService.calculateDiscount(elem.price, price)
        let tranferPrice = await GeneralService.calculateTranferPrice(
          elem.price,
          price,
          Number(Env.get('PERCENT_DISCOUNT_TRANSFER_PRICE'))
        )

        const volumetric = (elem.width * elem.depth * elem.height) / 4000
        let weight = volumetric > elem.calculated_weight ? volumetric : elem.calculated_weight
        weight = Env.get('COUNTRY_CODE') === 'PE' ? elem.calculated_weight : weight

        const inventoryLevel = (await CatalogSafeStock.query()
          .where('sku', elem.sku.trim())
          .pojo()) as SafeStockItem[]
        let imagesVariation = await GeneralService.getImagesByVariation(
          product.images,
          elem.sku,
          elem.image_url
        )
        let hover = GeneralService.getHoverImageByVariation(product.images, elem.sku)

        let returnVariants: FormattedVariant = {
          id: elem.id,
          product_id: product.id,
          sku: elem.sku,
          type: 'variant',
          image: imagesVariation[0],
          hover: hover,
          stock:
            inventoryLevel && inventoryLevel.length
              ? inventoryLevel[0].available_to_sell
              : Math.max(
                  0,
                  elem.inventory_level -
                    (typeof inventoryLevel[0]?.safety_stock === 'number'
                      ? inventoryLevel[0].safety_stock
                      : 0)
                ),
          main_title: product.name,
          normal_price: elem.price,
          discount_price: price,
          cash_price: tranferPrice,
          discount_rate: discount,
          warning_stock: inventoryLevel[0]?.safety_stock || 0,
          images: imagesVariation,
          quantity: 1,
          armed_cost: 0,
          armed_quantity: 1,
          weight,
          height: elem.height,
          width: elem.width,
          depth: elem.depth,
          options: elem.option_values.length ? JSON.stringify(elem.option_values) : undefined,
        }
        arrayVariants.push(returnVariants)
      })
    )

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
