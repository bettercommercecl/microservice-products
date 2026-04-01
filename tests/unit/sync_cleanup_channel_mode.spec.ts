import SyncCleanupService from '#services/synchronizations/sync_cleanup_service'
import { test } from '@japa/runner'

test.group('SyncCleanupService modo canal', () => {
  test('expone cleanupAfterChannelSync para sync v2 por canal', async ({ assert }) => {
    const svc = new SyncCleanupService()
    assert.isFunction(svc.cleanupAfterChannelSync)
  })
})
