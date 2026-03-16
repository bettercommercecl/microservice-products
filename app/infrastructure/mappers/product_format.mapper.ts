import type { ProductForFormatDTO } from '#application/dto/product_format.dto'
import type Product from '#models/product'

/**
 * Mapea modelo Lucid Product a DTO de entrada del formatter.
 * La dependencia de #models queda en infrastructure.
 */
export function toProductForFormatDTO(product: Product): ProductForFormatDTO {
  return {
    id: product.id,
    images: product.images,
    categories: product.categories,
    image: product.image,
    hover: product.hover,
    normal_price: product.normal_price,
    discount_price: product.discount_price,
    variants: product.variants ?? [],
    type: product.type,
    title: product.title,
    page_title: product.page_title,
    description: product.description,
    brand_id: product.brand_id,
    stock: product.stock,
    warning_stock: product.warning_stock,
    quantity: product.quantity,
    armed_cost: product.armed_cost,
    weight: product.weight,
    sort_order: product.sort_order,
    featured: product.featured,
    is_visible: product.is_visible,
    total_sold: product.total_sold,
    reserve: product.reserve,
    reviews: product.reviews,
    sameday: product.sameday,
    despacho24horas: product.despacho24horas,
    free_shipping: product.free_shipping,
    pickup_in_store: product.pickup_in_store,
    turbo: product.turbo,
    meta_keywords: product.meta_keywords,
    meta_description: product.meta_description,
    timer_status: product.timer_status,
    timer_price: product.timer_price,
    timer_datetime: product.timer_datetime as ProductForFormatDTO['timer_datetime'],
    nextday: product.nextday,
    url: product.url,
  }
}
