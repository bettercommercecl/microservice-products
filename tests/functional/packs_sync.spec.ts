import { test } from '@japa/runner'
import Database from '@adonisjs/lucid/services/db'
import env from '#start/env'

test.group('Packs Sync', (group) => {
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
  })
  group.each.teardown(async () => {
    await Database.rollbackGlobalTransaction()
  })

  test('endpoint retorna estructura correcta', async ({ client, assert }) => {
    const response = await client.get('/api/sincronizar-packs')

    response.assertStatus(200)
    response.assertBodyContains({ success: true })
    response.assertBodyContains({ meta: { version: 'packs-sync' } })
    assert.property(response.body(), 'data')
  }).skip(!!env.get('PACKS_CATEGORY_ID'), 'Omite cuando PACKS_CATEGORY_ID definido (evita sync real a BC)')
})
