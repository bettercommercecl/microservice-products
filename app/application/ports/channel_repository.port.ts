import type { ChannelSyncInput } from '#application/use_cases/channels/sync_channels_from_config_use_case'

export interface ChannelRepositoryPort {
  upsertChannel(input: ChannelSyncInput): Promise<void>
}

