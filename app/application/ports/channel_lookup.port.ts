export interface ChannelLookupPort {
  getParentCategoryId(channelId: number): Promise<number | undefined>
}

