import {
  buildMetaCatalogRows,
  type MetaCatalogProductInput,
  type MetaCatalogRow,
  type MetaCatalogVariantInput,
} from '#application/formatters/meta_catalog_csv_formatter'
import type { ChannelLookupPort } from '#application/ports/channel_lookup.port'
import type { ProductRepositoryPort } from '#application/ports/product_repository.port'
import { DomainException } from '#domain/exceptions/domain_exception'
import CatalogSafeStock from '#models/catalog_safe_stock'
import Channel from '#models/channel'
import Product from '#models/product'
import Variant from '#models/variant'
import env from '#start/env'
import { getMetaCatalogChannelConfig } from '#utils/meta_catalog_channel_config'

interface VariantOption {
  label?: string
}

export interface GetMetaCatalogByBrandResult {
  rows: MetaCatalogRow[]
  meta: {
    brand: string
    countryCode: string
    channelId: number
    total: number
    clientUrl: string
    currency: string
  }
}

function parseVariantOptionLabels(variant: Variant): string[] {
  const rawOptions = variant.options
  if (Array.isArray(rawOptions)) {
    return rawOptions
      .map((option) => (option as VariantOption).label?.trim())
      .filter((label): label is string => Boolean(label))
  }

  if (typeof rawOptions === 'string' && rawOptions.trim() !== '') {
    try {
      const parsed = JSON.parse(rawOptions) as VariantOption[]
      if (Array.isArray(parsed)) {
        return parsed
          .map((option) => option.label?.trim())
          .filter((label): label is string => Boolean(label))
      }
    } catch {
      // Sin opciones parseables
    }
  }

  if (variant.option_label?.trim()) {
    return [variant.option_label.trim()]
  }

  return []
}

function resolveAvailableToSell(variant: Variant): number {
  const stockData = variant.stockData as CatalogSafeStock | null
  if (stockData?.available_to_sell != null) {
    return Number(stockData.available_to_sell) || 0
  }
  return Number(variant.stock) || 0
}

function mapProductToMetaInput(product: Product): MetaCatalogProductInput | null {
  const variants = (product.variants ?? []) as Variant[]
  if (variants.length === 0) {
    return null
  }

  const mappedVariants: MetaCatalogVariantInput[] = variants.map((variant, index) => ({
    sku: variant.sku,
    image: variant.image || product.image || '',
    normalPrice: Number(variant.normal_price) || 0,
    discountPrice: Number(variant.discount_price) || 0,
    availableToSell: resolveAvailableToSell(variant),
    optionLabels: parseVariantOptionLabels(variant),
    isFirstVariant: index === 0,
  }))

  return {
    productId: product.product_id,
    title: product.title,
    pageTitle: product.page_title,
    description: product.description,
    url: product.url,
    brandName: product.brand?.name ?? '',
    variants: mappedVariants,
  }
}

export default class GetMetaCatalogByBrandUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly channelLookup: ChannelLookupPort
  ) {}

  async execute(brand: string): Promise<GetMetaCatalogByBrandResult> {
    const countryCode = env.get('COUNTRY_CODE')
    const channelConfig = getMetaCatalogChannelConfig(brand, countryCode)

    const channel = await Channel.query()
      .whereRaw('LOWER(TRIM(name)) = LOWER(TRIM(?))', [brand])
      .first()

    if (!channel) {
      throw new DomainException(
        `Canal no encontrado con nombre: ${brand}`,
        { type: 'business', brand },
        404
      )
    }

    const parentCategoryId = await this.channelLookup.getParentCategoryId(channel.id)
    const products = (await this.productRepository.findAllVisibleByChannel(
      channel.id,
      parentCategoryId
    )) as Product[]

    const metaProducts = products
      .map((product) => mapProductToMetaInput(product))
      .filter((product): product is MetaCatalogProductInput => product != null)

    const rows = buildMetaCatalogRows(metaProducts, channelConfig.clientUrl, channelConfig.currency)

    return {
      rows,
      meta: {
        brand: brand.toUpperCase(),
        countryCode,
        channelId: channel.id,
        total: rows.length,
        clientUrl: channelConfig.clientUrl,
        currency: channelConfig.currency,
      },
    }
  }
}
