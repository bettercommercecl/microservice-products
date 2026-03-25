import type { ChannelLookupPort } from '#application/ports/channel_lookup.port'
import Channel from '#models/channel'

export default class ChannelLookupAdapter implements ChannelLookupPort {
  async getParentCategoryId(channelId: number): Promise<number | undefined> {
    const channel = await Channel.find(channelId)
    const parentCategoryId = channel?.parent_category
    return parentCategoryId == null ? undefined : parentCategoryId
  }
}

