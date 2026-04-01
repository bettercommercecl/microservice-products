import SyncWebhookNotifier from '#services/synchronizations/sync_webhook_notifier'
import { test } from '@japa/runner'

test.group('SyncWebhookNotifier', () => {
  test('expone notifyChannel y notifyAllChannelsInCountry', async ({ assert }) => {
    const notifier = new SyncWebhookNotifier()
    assert.isFunction(notifier.notifyChannel)
    assert.isFunction(notifier.notifyAllChannelsInCountry)
  })
})
