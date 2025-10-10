// import CatalogSafeStock from '#models/catalog.safe.stock'
// import Env from '#start/env'
// import BigCommerceService from '#services/bigcommerce_service'
// import PriceService from '#services/price_service'
// import InventoryService from '#services/inventory_service'
// import PriceCalculationService from '#services/calculation_service'
// import ImageProcessingService from '#services/image_processing_service'
// import OptionProcessingService from '#services/option_processing_service'
// import {
//   FormattedOption,
//   FormattedProductOption,
//   FormattedVariant,
//   ProductImage,
//   ProductOption,
//   // ProductVariant,
//   Product,
// //   SafeStockItem,
// //   OptionValue,
// // } from '@/app/interfaces/general_interfaces.js'
// // import Logger from '@adonisjs/core/services/logger'

// // export class GeneralService {
// //   private static bigCommerceService = new BigCommerceService()
// //   private static priceCalculationService = new PriceCalculationService()
// //   private static imageProcessingService = new ImageProcessingService()
// //   private static optionProcessingService = new OptionProcessingService()
// //   private static readonly logger = Logger.child({ service: 'GeneralService' })

// //   /**
// //    * 💰 Calcula el porcentaje de descuento (delegado a PriceCalculationService)
// //    */
// //   static calculateDiscount(price: number = 0, salePrice: number = 0): string {
// //     return GeneralService.priceCalculationService.calculateDiscount(price, salePrice)
// //   }

// //   /**
// //    * 💸 Calcula el precio de transferencia (delegado a PriceCalculationService)
// //    */
// //   static calculateTransferPrice(
// //     price: number = 0,
// //     salePrice: number = 0,
// //     transferPercent: number = 2
// //   ): number {
// //     return GeneralService.priceCalculationService.calculateTransferPrice(
// //       price,
// //       salePrice,
// //       transferPercent
// //     )
// //   }

// //   /**
// //    *  Obtiene la imagen miniatura del producto (delegado a ImageProcessingService)
// //    */
// //   static getThumbnailByProducts(images: ProductImage[]): string | undefined {
// //     return GeneralService.imageProcessingService.getThumbnailImage(images)
// //   }

// //   /**
// //    *  Obtiene la imagen hover del producto (delegado a ImageProcessingService)
// //    */
// //   static getHoverByProducts(images: ProductImage[]): string | undefined {
// //     return GeneralService.imageProcessingService.getHoverImage(images)
// //   }

// //   /**
// //    *  Obtiene las imágenes del producto por variación (delegado a ImageProcessingService)
// //    */
// //   static getImagesByVariation(images: ProductImage[], sku: string, thumbnail: string): string[] {
// //     return GeneralService.imageProcessingService.getImagesByVariation(images, sku, thumbnail)
// //   }

// //   /**
// //    * Formatea los valores de las opciones del producto (delegado a OptionProcessingService)
// //    */
// //   static getOptionsValues(options: OptionValue[]): FormattedOption[] {
// //     return GeneralService.optionProcessingService.formatOptionsValues(options)
// //   }

// //   /**
// //    * Formatea los productos para la sincronización
// //    */
// //   static async FormatProductsArray(products: Product[]): Promise<any[]> {
// //     try {
// //       // OPTIMIZACIÓN: Obtener solo productos con variantes válidas
// //       const validProducts = products.filter((p) => p.variants && p.variants.length > 0)

// //       if (validProducts.length === 0) {
// //         // Assuming 'this.logger' is available or needs to be imported/defined
// //         // For now, commenting out the line as it's not defined in the original file
// //         // this.logger.warn('No hay productos con variantes válidas para procesar')
// //         return []
// //       }

// //       // 1. Obtener todos los SKUs únicos de productos válidos
// //       const skus = validProducts.map((p) => p.variants[0].sku.trim()).filter(Boolean)

// //       // 2. Traer todos los inventarios en una sola query (más eficiente)
// //       const inventoryLevels = (await CatalogSafeStock.query()
// //         .whereIn('sku', skus)
// //         .pojo()) as SafeStockItem[]

// //       // 3. Crear un mapa para acceso rápido O(1)
// //       const inventoryMap = new Map(inventoryLevels.map((item) => [item.sku.trim(), item]))

// //       // OPTIMIZACIÓN: Procesar productos en paralelo sin operaciones innecesarias
// //       const productInfoArray = await Promise.all(
// //         validProducts.map(async (product) => {
// //           try {
// //             const sku = product.variants[0].sku.trim()
// //             const inventoryLevel = inventoryMap.get(sku)

// //             // OPTIMIZACIÓN: Cálculos más eficientes
// //             const volumetric = (product.width * product.depth * product.height) / 4000
// //             const weight =
// //               Env.get('COUNTRY_CODE') === 'PE'
// //                 ? product.weight
// //                 : Math.max(volumetric, product.weight)

// //             // OPTIMIZACIÓN: Usar ImageProcessingService para obtener imágenes
// //             const thumbnailImage = GeneralService.getThumbnailByProducts(product.images || []) || ''
// //             const hoverImage = GeneralService.getHoverByProducts(product.images || []) || ''

// //             // OPTIMIZACIÓN: Calcular stock una sola vez
// //             const stock = inventoryLevel
// //               ? (inventoryLevel as SafeStockItem).available_to_sell || 0
// //               : Math.max(
// //                   0,
// //                   product.inventory_level -
// //                     ((inventoryLevel as unknown as SafeStockItem)?.safety_stock || 0)
// //                 )

// //             // OPTIMIZACIÓN: Calcular precios usando PriceCalculationService
// //             const cashPrice = GeneralService.calculateTransferPrice(
// //               product.price,
// //               product.sale_price,
// //               Number(Env.get('PERCENT_DISCOUNT_TRANSFER_PRICE'))
// //             )
// //             const priceCalculationService = new PriceCalculationService()
// //             const discountPercent = priceCalculationService.calculateDiscount(
// //               product.price,
// //               product.sale_price
// //             )

// //             return {
// //               id: product.id,
// //               image: thumbnailImage,
// //               images: Array.isArray(product.images) ? [...product.images].reverse() : [],
// //               hover: hoverImage,
// //               title: product.name,
// //               page_title: product.name,
// //               description: product.description,
// //               brand_id: product.brand_id,
// //               stock,
// //               warning_stock: (inventoryLevel as SafeStockItem)?.safety_stock || 0,
// //               normal_price: product.price,
// //               discount_price: product.sale_price,
// //               cash_price: cashPrice,
// //               percent: discountPercent,
// //               url: product.custom_url?.url ?? '/',
// //               type: product.variants.length > 1 ? 'variation' : 'product',
// //               quantity: product.quantity ?? 0,
// //               armed_cost: 0,
// //               weight,
// //               sort_order: product.sort_order,
// //               reserve: null,
// //               sameday: false,
// //               free_shipping: false,
// //               despacho24horas: false,
// //               pickup_in_store: false,
// //               turbo: false,
// //               featured: product.is_featured,
// //               is_visible: product.is_visible,
// //               meta_keywords: Array.isArray(product.meta_keywords) ? product.meta_keywords : [],
// //               meta_description: product?.meta_description ?? '',
// //               reviews:
// //                 typeof product.reviews === 'object' && product.reviews !== null
// //                   ? product.reviews
// //                   : null,
// //               sizes: Array.isArray(product.sizes) ? product.sizes : null,
// //             }
// //           } catch (err) {
// //             // Assuming 'this.logger' is available or needs to be imported/defined
// //             // For now, commenting out the line as it's not defined in the original file
// //             // this.logger.error(`Error procesando producto ID ${product.id}:`, err)
// //             return null
// //           }
// //         })
// //       )
// //       console.log('general', productInfoArray)
// //       // OPTIMIZACIÓN: Filtrar productos fallidos y procesar JSON una sola vez
// //       const validProductsInfo = productInfoArray
// //         .filter((product): product is NonNullable<typeof product> => product !== null)
// //         .map((product) => ({
// //           ...product,
// //           // CORREGIDO: Convertir arrays/objetos a JSON strings para la BD (como en product_service.ts)
// //           images: Array.isArray(product.images) ? JSON.stringify(product.images) : null,
// //           meta_keywords: Array.isArray(product.meta_keywords)
// //             ? JSON.stringify(product.meta_keywords)
// //             : null,
// //           reviews:
// //             typeof product.reviews === 'object' && product.reviews !== null
// //               ? JSON.stringify(product.reviews)
// //               : null,
// //           sizes: Array.isArray(product.sizes) ? JSON.stringify(product.sizes) : null,
// //         }))

// //       // Assuming 'this.logger' is available or needs to be imported/defined
// //       // For now, commenting out the line as it's not defined in the original file
// //       // this.logger.info(`Procesados ${validProductsInfo.length} productos correctamente de ${validProducts.length} totales`)
// //       return validProductsInfo
// //     } catch (error) {
// //       // Assuming 'this.logger' is available or needs to be imported/defined
// //       // For now, commenting out the line as it's not defined in the original file
// //       // this.logger.error('Error en FormatProductsArray:', error)
// //       throw error
// //     }
// //   }

//   // /**
//   //  * Formatea las opciones por variante del producto (delegado a OptionProcessingService)
//   //  */
//   // static async formatOptionsByVariantByProduct(
//   //   product: Product
//   // ): Promise<FormattedProductOption[]> {
//   //   try {
//   //     const data = await GeneralService.bigCommerceService.getVariantsOptionsOfProduct(product.id)

//   //     if (!data || data.length === 0) {
//   //       return []
//   //     }

//   //     // Validar datos antes de procesar
//   //     if (!GeneralService.optionProcessingService.validateOptions(data)) {
//   //       GeneralService.logger.warn(`Opciones inválidas para producto ${product.id}`)
//   //       return []
//   //     }

//   //     return GeneralService.optionProcessingService.formatProductOptions(data)
//   //   } catch (error) {
//   //     GeneralService.logger.error(
//   //       `Error formateando opciones para producto ${product.id}:`,
//   //       error
//   //     )
//   //     return []
//   //   }
//   // }

//   // /**
//   //  * Formatea las variantes del producto
//   //  */
//   // static async formatVariantsByProduct(product: Product): Promise<FormattedVariant[]> {
//   //   console.time(`formatVariantsByProduct - TOTAL (producto ${product.id})`)
//   //   console.log(`Iniciando formatVariantsByProduct para producto ${product.id}`)

//   //   // console.time(`formatVariantsByProduct - getVariantsOfProduct (producto ${product.id})`)
//   //   // let data = await GeneralService.bigCommerceService.getVariantsOfProduct(product.id)
//   //   // console.timeEnd(`formatVariantsByProduct - getVariantsOfProduct (producto ${product.id})`)

//   //   // console.log(`Producto ${product.id} - Procesando ${data.length} variantes`)

//   //   let arrayVariants: FormattedVariant[] = []

//   //   // Cache de inventario para evitar llamadas repetidas al mismo SKU
//   //   const inventoryCache = new Map<string, any>()

//   //   // Cache de CatalogSafeStock para evitar queries repetidas
//   //   const safeStockCache = new Map<string, any>()

//   //   // Batch query para CatalogSafeStock - obtener todos los SKUs de una vez
//   //   console.time(`formatVariantsByProduct - batch CatalogSafeStock query (producto ${product.id})`)
//   //   const skus = product.variants.map((variant) => variant.sku)
//   //   const safeStockBatch = await CatalogSafeStock.query().whereIn('sku', skus).pojo()

//   //   // Crear cache con los resultados del batch
//   //   safeStockBatch.forEach((item: any) => {
//   //     safeStockCache.set(item.sku, item)
//   //   })
//   //   console.timeEnd(
//   //     `formatVariantsByProduct - batch CatalogSafeStock query (producto ${product.id})`
//   //   )
//   //   console.log(
//   //     `Cache de CatalogSafeStock creado con ${safeStockBatch.length} registros para ${skus.length} SKUs`
//   //   )

//   //   // Procesar todas las variantes en paralelo
//   //   const processedVariants = await Promise.all(
//   //     product.variants.map(async function (elem: ProductVariant, index: number) {
//   //       console.time(
//   //         `formatVariantsByProduct - variante ${elem.id} (${index + 1}/${product.variants.length})`
//   //       )

//   //       try {
//   //         console.time(`formatVariantsByProduct - variante ${elem.id} - PriceService`)
//   //         const priceData = await PriceService.getPriceByVariantId(elem.id)
//   //         console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - PriceService`)

//   //         // Verificar si ya tenemos el inventario en cache
//   //         let inventoryData
//   //         if (inventoryCache.has(elem.sku)) {
//   //           console.log(`Cache hit para SKU ${elem.sku}`)
//   //           inventoryData = inventoryCache.get(elem.sku)
//   //         } else {
//   //           console.time(`formatVariantsByProduct - variante ${elem.id} - InventoryService`)
//   //           inventoryData = await InventoryService.getInventoryByVariantId(elem.id)
//   //           console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - InventoryService`)

//   //           // Guardar en cache para futuras variantes con el mismo SKU
//   //           inventoryCache.set(elem.sku, inventoryData)
//   //           console.log(`💾 Cache miss para SKU ${elem.sku} - guardado en cache`)
//   //         }

//   //         console.time(`formatVariantsByProduct - variante ${elem.id} - calculateDiscount`)
//   //         const priceCalculationService = new PriceCalculationService()
//   //         const discountRate = priceCalculationService.calculateDiscount(
//   //           priceData?.price || 0,
//   //           priceData?.calculatedPrice || 0
//   //         )
//   //         console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - calculateDiscount`)

//   //         console.time(`formatVariantsByProduct - variante ${elem.id} - calculateTranferPrice`)
//   //         const transferPrice = priceCalculationService.calculateTransferPrice(
//   //           priceData?.price || 0,
//   //           priceData?.calculatedPrice || 0
//   //         )
//   //         console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - calculateTranferPrice`)

//   //         console.time(`formatVariantsByProduct - variante ${elem.id} - cálculos volumétricos`)
//   //         const volumetricWeight = Math.max(
//   //           (elem.width * elem.depth * elem.height) / 6000,
//   //           elem.calculated_weight
//   //         )
//   //         console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - cálculos volumétricos`)

//   //         // Usar cache de CatalogSafeStock en lugar de query individual
//   //         console.time(
//   //           `formatVariantsByProduct - variante ${elem.id} - CatalogSafeStock cache lookup`
//   //         )
//   //         const safeStock = safeStockCache.get(elem.sku) || null
//   //         console.timeEnd(
//   //           `formatVariantsByProduct - variante ${elem.id} - CatalogSafeStock cache lookup`
//   //         )

//   //         console.time(`formatVariantsByProduct - variante ${elem.id} - getImagesByVariation`)
//   //         const images = await GeneralService.getImagesByVariation(
//   //           product.images || [],
//   //           elem.sku,
//   //           elem.image_url || ''
//   //         )
//   //         console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - getImagesByVariation`)

//   //         console.time(`formatVariantsByProduct - variante ${elem.id} - getHoverImageByVariation`)
//   //         const hoverImage = GeneralService.getHoverImageByVariation(product.images, elem.sku)
//   //         console.timeEnd(
//   //           `formatVariantsByProduct - variante ${elem.id} - getHoverImageByVariation`
//   //         )

//   //         console.time(`formatVariantsByProduct - variante ${elem.id} - crear objeto`)
//   //         const variant: FormattedVariant = {
//   //           id: elem.id,
//   //           product_id: product.id,
//   //           title: product.name,
//   //           sku: elem.sku,
//   //           type: product.name,
//   //           image: images[0] || '',
//   //           hover: hoverImage,
//   //           stock: inventoryData?.availableToSell || 0,
//   //           main_title: product.name,
//   //           normal_price: priceData?.price || 0,
//   //           discount_price: priceData?.calculatedPrice || 0,
//   //           cash_price: transferPrice,
//   //           discount_rate: discountRate,
//   //           warning_stock: safeStock?.safety_stock || 0,
//   //           images: images,
//   //           quantity: inventoryData?.availableToSell || 0,
//   //           armed_cost: 0, // No disponible en el modelo
//   //           armed_quantity: 1, // Valor por defecto
//   //           weight: volumetricWeight,
//   //           height: elem.height,
//   //           width: elem.width,
//   //           depth: elem.depth,
//   //           keywords: null,
//   //           option_label: null,
//   //           options: JSON.stringify(elem.option_values),
//   //         }
//   //         console.timeEnd(`formatVariantsByProduct - variante ${elem.id} - crear objeto`)

//   //         console.timeEnd(
//   //           `formatVariantsByProduct - variante ${elem.id} (${index + 1}/${product.variants.length})`
//   //         )
//   //         return variant
//   //       } catch (error) {
//   //         console.error(`Error procesando variante ${elem.id}:`, error)
//   //         console.timeEnd(
//   //           `formatVariantsByProduct - variante ${elem.id} (${index + 1}/${product.variants.length})`
//   //         )
//   //         return null
//   //       }
//   //     })
//   //   )

//   //   // Filtrar variantes que fallaron y asignar al array
//   //   arrayVariants = processedVariants.filter((variant) => variant !== null) as FormattedVariant[]

//   //   console.timeEnd(`formatVariantsByProduct - TOTAL (producto ${product.id})`)
//   //   return arrayVariants
//   // }

//   // /**
//   //  *  Obtiene imagen hover por variación (delegado a ImageProcessingService)
//   //  */
//   // static getHoverImageByVariation(images: ProductImage[], sku: string): string | undefined {
//   //   return GeneralService.imageProcessingService.getHoverImageByVariation(images, sku)
//   // }
// }
