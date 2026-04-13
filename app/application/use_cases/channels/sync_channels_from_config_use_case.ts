import type { ChannelRepositoryPort } from '#application/ports/channel_repository.port'
import syncConfig from '#config/sync'
import env from '#start/env'
import { channels } from '#utils/channels/channels'

export interface ChannelSyncInput {
  id: number
  name: string
  country: string
  parentCategory: number | null
  webhookUrl: string | null
  webhookSecret: string | null
  webhookEnabled: boolean
  searchIndexRefreshUrl: string | null
  searchIndexRefreshEnabled: boolean
}

export interface SyncChannelsFromConfigResult {
  createdOrUpdated: number
  skipped: number
  countryCode: string
}

function brandsApiKeyFromEnv(): string | undefined {
  return (
    env.get('API_KEY_BRANDS')?.trim() ||
    env.get('X_API_KEY_BRANDS')?.trim() ||
    process.env['X-API-KEY-BRANDS']?.trim()
  )
}

/** Solo persiste URL de refresco si viene definida y es URL absoluta valida. */
function searchIndexRefreshUrlOrNull(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    new URL(trimmed)
    return trimmed
  } catch {
    return null
  }
}

/**
 * Caso de uso: sincronizar la tabla channels a partir de la config estática de canales por país.
 */
export default class SyncChannelsFromConfigUseCase {
  constructor(private readonly channelRepo: ChannelRepositoryPort) {}

  async execute(countryCode: string): Promise<SyncChannelsFromConfigResult> {
    const results: SyncChannelsFromConfigResult = {
      createdOrUpdated: 0,
      skipped: 0,
      countryCode,
    }

    for (const [brandName, perCountry] of Object.entries(channels)) {
      const countryConfig = (perCountry as Record<string, any>)[countryCode]
      if (!countryConfig) {
        results.skipped++
        continue
      }

      const { CHANNEL, PARENT_CATEGORY, API_URL, API_URL_SEARCH_INDEX_REFRESH } = countryConfig
      const apiUrl = typeof API_URL === 'string' ? API_URL.trim() : ''
      const webhookUrl =
        apiUrl.length > 0
          ? `${apiUrl.replace(/\/$/, '')}${syncConfig.webhookSyncProductsPath}`
          : null
      const searchIndexRefreshUrl = searchIndexRefreshUrlOrNull(API_URL_SEARCH_INDEX_REFRESH)
      const webhookSecret = brandsApiKeyFromEnv() ?? null

      const input: ChannelSyncInput = {
        id: CHANNEL,
        name: brandName,
        country: countryCode,
        parentCategory: PARENT_CATEGORY ?? null,
        webhookUrl,
        webhookSecret,
        webhookEnabled: true,
        searchIndexRefreshUrl,
        searchIndexRefreshEnabled: true,
      }

      await this.channelRepo.upsertChannel(input)
      results.createdOrUpdated++
    }

    return results
  }
}
