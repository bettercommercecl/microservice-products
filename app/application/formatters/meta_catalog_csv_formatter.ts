export interface MetaCatalogRow {
  id: string
  title: string
  description: string
  availability: 'in stock' | 'out of stock'
  condition: 'new'
  price: string
  link: string
  image_link: string
  brand: string
}

export interface MetaCatalogVariantInput {
  sku: string
  image: string
  normalPrice: number
  discountPrice: number
  availableToSell: number
  optionLabels: string[]
  isFirstVariant: boolean
}

export interface MetaCatalogProductInput {
  productId: number
  title: string
  pageTitle: string
  description: string
  url: string
  brandName: string
  variants: MetaCatalogVariantInput[]
}

function escapeCsvValue(value: string): string {
  if (typeof value === 'string') {
    return `"${value.replace(/"/g, '""')}"`
  }
  return String(value)
}

export function formatMetaCatalogPrice(currency: string, price: number): string {
  const formattedPrice = Math.floor(price * 100) / 100
  return `${formattedPrice} ${currency}`
}

export function plainMetaCatalogDescription(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .replace(/\n/g, '')
    .trim()
}

function buildProductLink(clientUrl: string, productUrl: string, productId: number): string {
  const slug = productUrl.replace(/^\/+/, '')
  return `${clientUrl}/producto/${slug}?id=${productId}`
}

function resolveAvailability(availableToSell: number): 'in stock' | 'out of stock' {
  return availableToSell > 0 ? 'in stock' : 'out of stock'
}

function resolveVariantTitle(
  product: MetaCatalogProductInput,
  variant: MetaCatalogVariantInput
): string {
  const baseTitle = (product.title || product.pageTitle || '').trim()
  if (variant.isFirstVariant || variant.optionLabels.length === 0) {
    return baseTitle
  }
  return `${baseTitle} - ${variant.optionLabels.join('-')}`
}

function resolveVariantPrice(variant: MetaCatalogVariantInput): number {
  const discount = Number(variant.discountPrice)
  if (discount > 0) {
    return discount
  }
  return Number(variant.normalPrice) || 0
}

export function buildMetaCatalogRows(
  products: MetaCatalogProductInput[],
  clientUrl: string,
  currency: string
): MetaCatalogRow[] {
  const rows: MetaCatalogRow[] = []

  for (const product of products) {
    const description = plainMetaCatalogDescription(product.description || '')
    const brandName = product.brandName || ''

    for (const variant of product.variants) {
      const title = resolveVariantTitle(product, variant)
      if (title.toLowerCase().includes('outlet')) {
        continue
      }

      rows.push({
        id: String(variant.sku),
        title,
        description,
        availability: resolveAvailability(variant.availableToSell),
        condition: 'new',
        price: formatMetaCatalogPrice(currency, resolveVariantPrice(variant)),
        link: buildProductLink(clientUrl, product.url, product.productId),
        image_link: variant.image || '',
        brand: brandName,
      })
    }
  }

  return rows
}

export function generateMetaCatalogCsv(rows: MetaCatalogRow[]): string {
  if (rows.length === 0) {
    return ''
  }

  const headers = Object.keys(rows[0]) as (keyof MetaCatalogRow)[]
  const headerLine = headers.map((header) => escapeCsvValue(header)).join(',')
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsvValue(String(row[header] ?? ''))).join(',')
  )

  return [headerLine, ...dataLines].join('\n')
}
