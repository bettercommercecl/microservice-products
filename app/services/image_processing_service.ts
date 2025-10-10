import Logger from '@adonisjs/core/services/logger'

interface ProductImage {
  is_thumbnail: boolean
  url_standard: string
  url_zoom: string
  description: string
  sort_order: number
}

export default class ImageProcessingService {
  private readonly logger = Logger.child({ service: 'ImageProcessingService' })

  /**
   *  Obtiene la imagen miniatura del producto
   * @param images - Array de imágenes del producto
   * @returns URL de la imagen miniatura o undefined
   */
  getThumbnailImage(images: ProductImage[]): string | undefined {
    try {
      if (!Array.isArray(images) || images.length === 0) {
        return undefined
      }

      const thumbnail = images.find((image) => image.is_thumbnail === true)
      return thumbnail?.url_standard
    } catch (error) {
      this.logger.error('Error obteniendo imagen miniatura:', error)
      return undefined
    }
  }

  /**
   *  Obtiene la imagen hover del producto
   * @param images - Array de imágenes del producto
   * @returns URL de la imagen hover o undefined
   */
  getHoverImage(images: ProductImage[]): string | undefined {
    try {
      if (!Array.isArray(images) || images.length === 0) {
        return undefined
      }

      const hover = images.find(
        (image) => image.description && image.description.toLowerCase().includes('hover')
      )
      return hover?.url_standard
    } catch (error) {
      this.logger.error('Error obteniendo imagen hover:', error)
      return undefined
    }
  }

  /**
   *  Obtiene las imágenes del producto por variación
   * @param images - Array de imágenes del producto
   * @param sku - SKU de la variante
   * @param thumbnail - Imagen miniatura
   * @returns Array de URLs de imágenes
   */
  getImagesByVariation(images: any[], sku: string, thumbnail: string): string[] {
    try {
      if (!Array.isArray(images) || images.length === 0) {
        return thumbnail ? [thumbnail] : []
      }

      const variationImages: string[] = []

      // Agregar thumbnail si existe
      if (thumbnail) {
        variationImages.push(thumbnail)
      }

      // Ordenar imágenes por sort_order y filtrar por SKU
      const sortedImages = images
        .sort((a, b) => a.sort_order - b.sort_order)
        .filter((image) => image.description && image.description.includes(sku))

      // Agregar URLs de zoom
      sortedImages.forEach((image) => {
        if (image.url_zoom) {
          variationImages.push(image.url_zoom)
        }
      })

      return variationImages
    } catch (error) {
      this.logger.error('Error obteniendo imágenes por variación:', error)
      return thumbnail ? [thumbnail] : []
    }
  }

  /**
   *  Obtiene imagen hover por variación
   * @param images - Array de imágenes del producto
   * @param sku - SKU de la variante
   * @returns URL de la imagen hover o undefined
   */
  getHoverImageByVariation(images: ProductImage[], sku: string): string | undefined {
    try {
      if (!Array.isArray(images) || images.length === 0) {
        return undefined
      }

      const hoverImage = images.find(
        (image) =>
          image.description &&
          image.description.includes(sku) &&
          image.description.toLowerCase().includes('hover')
      )

      return hoverImage?.url_standard
    } catch (error) {
      this.logger.error('Error obteniendo imagen hover por variación:', error)
      return undefined
    }
  }

  /**
   * 📸 Procesa y optimiza array de imágenes
   * @param images - Array de imágenes
   * @returns Array de imágenes procesadas
   */
  processImageArray(images: ProductImage[]): ProductImage[] {
    try {
      if (!Array.isArray(images)) {
        return []
      }

      return images
        .filter((image) => image && image.url_standard)
        .sort((a, b) => a.sort_order - b.sort_order)
    } catch (error) {
      this.logger.error('Error procesando array de imágenes:', error)
      return []
    }
  }
}
