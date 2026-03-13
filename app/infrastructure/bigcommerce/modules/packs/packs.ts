import type { Logger } from '@adonisjs/core/logger'
import type { PackProduct } from './interfaces/pack_product.interface.js'
import ProductsApi from '../products/products.js'
import env from '#start/env'

export default class PacksApi {
  private readonly metafieldKey: string

  constructor(
    private readonly logger: Logger,
    private readonly products: ProductsApi
  ) {
    this.metafieldKey = env.get('PACKS_METAFIELD_KEY', 'packs')
  }

  /**
   * Obtiene todos los productos pack desde BigCommerce.
   * Requiere PACKS_CATEGORY_ID en env para filtrar por categoria.
   * Para cada producto obtiene el metafield de packs y adjunta items_packs.
   */
  async getAllProductsPacks(): Promise<PackProduct[]> {
    const categoryId = env.get('PACKS_CATEGORY_ID')
    if (!categoryId) {
      this.logger.warn('PACKS_CATEGORY_ID no configurado. Sync de packs omitida.')
      return []
    }

    const { data: products } = await this.products.getAll({
      'categories:in': [categoryId],
      limit: 250,
    })

    if (!products?.length) {
      this.logger.info('No se encontraron productos en la categoria de packs')
      return []
    }

    const packsWithItems: PackProduct[] = []
    const BATCH_SIZE = 10
    const DELAY_MS = 200

    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (p: any) => {
          const metafieldValue = await this.products.getMetafields(p.id, this.metafieldKey)
          let items_packs = Array.isArray(metafieldValue) ? metafieldValue : []

          if (typeof metafieldValue === 'string') {
            try {
              items_packs = JSON.parse(metafieldValue) ?? []
            } catch {
              items_packs = []
            }
          }

          return {
            id: p.id,
            items_packs: items_packs ?? [],
            itemsPacks: items_packs ?? [],
            variants: p.variants?.map((v: any) => ({ id: v.id, product_id: p.id })) ?? [],
          } as PackProduct
        })
      )

      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          packsWithItems.push(r.value)
        }
      }

      if (i + BATCH_SIZE < products.length) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_MS))
      }
    }

    this.logger.info(`Packs: ${packsWithItems.length} productos con items_packs de ${products.length} en categoria`)
    return packsWithItems
  }
}
