import type { ChannelSyncInput } from '#application/use_cases/channels/sync_channels_from_config_use_case'
import type { ChannelRepositoryPort } from '#application/ports/channel_repository.port'
import Channel from '#models/channel'

export default class ChannelRepository implements ChannelRepositoryPort {
  async upsertChannel(input: ChannelSyncInput): Promise<void> {
    await Channel.updateOrCreate(
      {
        id: input.id,
        country: input.country,
      },
      {
        id: input.id,
        name: input.name,
        country: input.country,
        parent_category: input.parentCategory,
      }
    )
  }
}

