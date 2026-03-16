import Category from '#models/category'
import CategoryProduct from '#models/category_product'
import CategoryService from '#services/categories_service'
import env from '#start/env'

export interface ProductTagsCampaignsServiceDeps {
  categoryService: CategoryService
}

/**
 * Servicio que obtiene tags (beneficios) y campañas por producto a partir de categorías.
 * Centraliza el uso de ID_BENEFITS e ID_CAMPAIGNS.
 */
export default class ProductTagsCampaignsService {
  private readonly categoryService: CategoryService

  constructor(deps: ProductTagsCampaignsServiceDeps) {
    this.categoryService = deps.categoryService
  }

  /**
   * Tags y campañas para un solo producto (usa getCampaignsByCategory del CategoryService).
   */
  async getTagsAndCampaignsForProduct(
    productId: number
  ): Promise<{ tags: string[]; campaigns: string[] }> {
    const idBenefits = Number(env.get('ID_BENEFITS'))
    const idCampaigns = Number(env.get('ID_CAMPAIGNS'))
    const [childTags, childCampaigns] = await Promise.all([
      this.categoryService.getChildCategories(idBenefits),
      this.categoryService.getChildCategories(idCampaigns),
    ])
    const [tags, campaigns] = await Promise.all([
      this.categoryService.getCampaignsByCategory(productId, childTags),
      this.categoryService.getCampaignsByCategory(productId, childCampaigns),
    ])
    return {
      tags: tags.length ? [...new Set(tags)] : [],
      campaigns: campaigns.length ? [...new Set(campaigns)] : [],
    }
  }

  /**
   * Tags y campañas para muchos productos en una sola pasada (menos consultas que N llamadas a getTagsAndCampaignsForProduct).
   */
  async getTagsAndCampaignsForProducts(
    productIds: number[]
  ): Promise<Map<number, { tags: string[]; campaigns: string[] }>> {
    const result = new Map<number, { tags: string[]; campaigns: string[] }>()
    const uniqueIds = [...new Set(productIds)]
    if (uniqueIds.length === 0) return result

    const idBenefits = Number(env.get('ID_BENEFITS'))
    const idCampaigns = Number(env.get('ID_CAMPAIGNS'))
    const [childTags, childCampaigns] = await Promise.all([
      this.categoryService.getChildCategories(idBenefits),
      this.categoryService.getChildCategories(idCampaigns),
    ])

    const allCategoryIds = [...new Set([...childTags, ...childCampaigns])]
    if (allCategoryIds.length === 0) {
      uniqueIds.forEach((id) => result.set(id, { tags: [], campaigns: [] }))
      return result
    }

    const categoryTitlesMap = new Map<number, string>()
    const categories = await Category.query()
      .whereIn('category_id', allCategoryIds)
      .select(['category_id', 'title'])
    categories.forEach((c) => categoryTitlesMap.set(c.category_id, c.title))

    const childTagsSet = new Set(childTags)
    const childCampaignsSet = new Set(childCampaigns)
    const tagsMap = new Map<number, string[]>()
    const campaignsMap = new Map<number, string[]>()

    const productCategories = await CategoryProduct.query()
      .whereIn('product_id', uniqueIds)
      .whereIn('category_id', allCategoryIds)
      .select(['product_id', 'category_id'])

    productCategories.forEach((relation) => {
      const productId = relation.product_id
      const categoryId = relation.category_id
      const title = categoryTitlesMap.get(categoryId)
      if (!title) return

      if (childTagsSet.has(categoryId)) {
        if (!tagsMap.has(productId)) tagsMap.set(productId, [])
        tagsMap.get(productId)!.push(title)
      }
      if (childCampaignsSet.has(categoryId)) {
        if (!campaignsMap.has(productId)) campaignsMap.set(productId, [])
        campaignsMap.get(productId)!.push(title)
      }
    })

    uniqueIds.forEach((productId) => {
      const tags = tagsMap.get(productId) ?? []
      const campaigns = campaignsMap.get(productId) ?? []
      result.set(productId, {
        tags: tags.length > 0 ? [...new Set(tags)] : [],
        campaigns: campaigns.length > 0 ? [...new Set(campaigns)] : [],
      })
    })
    return result
  }
}
