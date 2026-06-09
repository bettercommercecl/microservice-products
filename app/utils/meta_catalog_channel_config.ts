import { DomainException } from '#domain/exceptions/domain_exception'
import { channels } from '#utils/channels/channels'

export interface MetaCatalogChannelConfig {
  clientUrl: string
  currency: string
}

/**
 * Resuelve dominio y moneda del canal según marca y país del despliegue.
 */
export function getMetaCatalogChannelConfig(
  brandCode: string,
  countryCode: string
): MetaCatalogChannelConfig {
  const brandUpper = brandCode.trim().toUpperCase()
  const countryUpper = countryCode.trim().toUpperCase()

  const brandConfig = channels[brandUpper as keyof typeof channels]
  if (!brandConfig) {
    throw new DomainException(
      `No existe configuración para la marca: ${brandUpper}`,
      { type: 'business', brand: brandUpper },
      404
    )
  }

  const countryConfig = (brandConfig as Record<string, { CLIENT_URL?: string; CURRENCY?: string }>)[
    countryUpper
  ]
  if (!countryConfig?.CLIENT_URL || !countryConfig.CURRENCY) {
    throw new DomainException(
      `No existe configuración Meta para ${brandUpper} en ${countryUpper}`,
      { type: 'business', brand: brandUpper, country: countryUpper },
      404
    )
  }

  return {
    clientUrl: countryConfig.CLIENT_URL.replace(/\/$/, ''),
    currency: countryConfig.CURRENCY,
  }
}
