import type { ChannelRepositoryPort } from '#application/ports/channel_repository.port'
import { channels } from '#utils/channels/channels'

export interface ChannelSyncInput {
  id: number
  name: string
  country: string
  parentCategory: number | null
}

export interface SyncChannelsFromConfigResult {
  createdOrUpdated: number
  skipped: number
  countryCode: string
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

      const { CHANNEL, PARENT_CATEGORY } = countryConfig
      const input: ChannelSyncInput = {
        id: CHANNEL,
        name: brandName,
        country: countryCode,
        parentCategory: PARENT_CATEGORY ?? null,
      }

      await this.channelRepo.upsertChannel(input)
      results.createdOrUpdated++
    }

    return results
  }
}

