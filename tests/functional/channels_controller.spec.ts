import { test } from '@japa/runner'
import Channel from '#models/channel'
import Database from '@adonisjs/lucid/services/db'

// 🇨🇱 Channel IDs únicos de Chile extraídos de la configuración
const CHILE_CHANNEL_IDS = [
  1, // UF (Ultimate Fitness) Chile
  1420393, // FC (First Care) Chile
  1443267, // AF (Aqua Force) Chile
  1461778, // TS (TSpin) Chile
  1457601, // TF (Terra Force) Chile
  1501686, // AR (Around) Chile
  1567036, // CC (Camillas Chile)
  1598942, // SF (Snow Force) Chile / UC (Ultimate Clothing) Chile
  1724574, // MK (Muu Kids) Chile
]

test.group('ChannelsController - Tests de Integración (Chile)', (group) => {
  // 🧹 SETUP: Limpiar base de datos antes de cada test usando transacciones
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
    return () => Database.rollbackGlobalTransaction()
  })

  // 🧪 TEST 1: GET /channels - Obtener canales de Chile
  test('🔍 GET /channels - Debe obtener canales de Chile exitosamente', async ({
    client,
    assert,
  }) => {
    // 📝 ARRANGE: Crear canales de Chile con channel_id reales
    const chileChannels = [
      { id: 1, name: 'UF_CL' }, // Ultimate Fitness Chile
      { id: 1420393, name: 'FC_CL' }, // First Care Chile
      { id: 1443267, name: 'AF_CL' }, // Aqua Force Chile
      { id: 1461778, name: 'TS_CL' }, // TSpin Chile
      { id: 1457601, name: 'TF_CL' }, // Terra Force Chile
    ]

    // Usar updateOrCreate para evitar conflictos de claves duplicadas
    for (const channel of chileChannels) {
      await Channel.updateOrCreate({ id: channel.id }, channel)
    }

    // 🚀 ACT: Hacer petición GET
    const response = await client.get('/api/channels')

    // ✅ ASSERT: Verificar respuesta
    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      data: chileChannels,
      meta: {
        total: 5,
      },
    })

    // Verificar estructura de respuesta
    const responseBody = response.body()
    assert.isArray(responseBody.data)
    assert.equal(responseBody.data.length, 5)
    assert.property(responseBody.meta, 'timestamp')
  })

  // 🧪 TEST 2: GET /channels - Debe manejar lista vacía
  test('🔍 GET /channels - Debe manejar lista vacía correctamente', async ({ client, assert }) => {
    // 🚀 ACT: Hacer petición GET sin datos
    const response = await client.get('/api/channels')

    // ✅ ASSERT: Verificar respuesta
    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      data: [],
      meta: {
        total: 0,
      },
    })

    const responseBody = response.body()
    assert.isArray(responseBody.data)
    assert.equal(responseBody.data.length, 0)
  })

  // 🧪 TEST 3: POST /channels/sync - Sincronizar canales de Chile desde configuración
  test('🔄 POST /channels/sync - Debe sincronizar canales de Chile desde configuración', async ({
    client,
    assert,
  }) => {
    // 🚀 ACT: Hacer petición POST para sincronizar
    const response = await client.post('/api/channels/sync')

    // ✅ ASSERT: Verificar respuesta
    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      message: 'Sincronización de canales completada exitosamente',
    })

    const responseBody = response.body()
    assert.property(responseBody.data, 'created')
    assert.property(responseBody.data, 'updated')
    assert.property(responseBody.data, 'errors')
    assert.isArray(responseBody.data.errors)

    // Verificar que se crearon canales
    const totalChannels = await Channel.query().count('* as total').first()
    assert.isAbove(Number(totalChannels?.$extras.total) || 0, 0)

    // Verificar estructura de meta
    assert.property(responseBody.meta, 'timestamp')
    assert.property(responseBody.meta, 'totalProcessed')
  })

  // 🧪 TEST 4: POST /channels/sync - Debe actualizar canales existentes
  test('🔄 POST /channels/sync - Debe actualizar canales existentes', async ({
    client,
    assert,
  }) => {
    // 📝 ARRANGE: Crear canal existente
    await Channel.create({
      id: 1,
      name: 'UF_CL_OLD',
    })

    // 🚀 ACT: Sincronizar canales
    const response = await client.post('/api/channels/sync')

    // ✅ ASSERT: Verificar respuesta
    response.assertStatus(200)
    const responseBody = response.body()

    // Verificar que se actualizó el canal existente
    const updatedChannel = await Channel.find(1)
    assert.equal(updatedChannel?.name, 'UF_PE') // El último canal procesado para ID 1
    assert.isAbove(responseBody.data.updated, 0)
  })

  // 🧪 TEST 5: GET /channels/:id - Obtener canal de Chile por ID
  test('🔍 GET /channels/:id - Debe obtener canal de Chile por ID exitosamente', async ({
    client,
    assert,
  }) => {
    // 📝 ARRANGE: Crear canal de Chile con channel_id real
    const chileChannel = await Channel.create({
      id: 1420393, // First Care Chile
      name: 'FC_CL',
    })

    // 🚀 ACT: Hacer petición GET
    const response = await client.get('/api/channels/1420393')

    // ✅ ASSERT: Verificar respuesta
    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      data: {
        id: 1420393,
        name: 'FC_CL',
      },
    })

    const responseBody = response.body()
    assert.equal(responseBody.data.id, chileChannel.id)
    assert.equal(responseBody.data.name, chileChannel.name)
    assert.property(responseBody.meta, 'timestamp')
  })

  // 🧪 TEST 6: GET /channels/:id - Debe manejar canal no encontrado
  test('🔍 GET /channels/:id - Debe manejar canal no encontrado', async ({ client }) => {
    // 🚀 ACT: Hacer petición GET con ID inexistente
    const response = await client.get('/api/channels/999')

    // ✅ ASSERT: Verificar respuesta
    response.assertStatus(404)
    response.assertBodyContains({
      success: false,
      message: 'Canal no encontrado',
      data: null,
    })
  })

  // 🧪 TEST 7: GET /channels/:id - Debe manejar ID inválido
  test('🔍 GET /channels/:id - Debe manejar ID inválido', async ({ client }) => {
    // 🚀 ACT: Hacer petición GET con ID inválido
    const response = await client.get('/api/channels/invalid')

    // ✅ ASSERT: Verificar que se maneja el error
    response.assertStatus(500)
  })

  // 🧪 TEST 8: Verificar canales específicos de Chile
  test('🇨🇱 Canales de Chile - Debe funcionar con todos los channel_id de Chile', async ({
    client,
    assert,
  }) => {
    // 📝 ARRANGE: Crear todos los canales de Chile
    const chileChannels = [
      { id: 1, name: 'UF_CL' }, // Ultimate Fitness Chile
      { id: 1420393, name: 'FC_CL' }, // First Care Chile
      { id: 1443267, name: 'AF_CL' }, // Aqua Force Chile
      { id: 1461778, name: 'TS_CL' }, // TSpin Chile
      { id: 1457601, name: 'TF_CL' }, // Terra Force Chile
      { id: 1501686, name: 'AR_CL' }, // Around Chile
      { id: 1567036, name: 'CC_CL' }, // Camillas Chile
      { id: 1598942, name: 'SF_CL' }, // Snow Force Chile
      { id: 1724574, name: 'MK_CL' }, // Muu Kids Chile
    ]

    // Usar updateOrCreate para evitar conflictos de claves duplicadas
    for (const channel of chileChannels) {
      await Channel.updateOrCreate({ id: channel.id }, channel)
    }

    // 🚀 ACT: Probar cada canal de Chile
    for (const channelId of CHILE_CHANNEL_IDS) {
      const response = await client.get(`/api/channels/${channelId}`)

      // ✅ ASSERT: Verificar que cada canal de Chile funciona
      response.assertStatus(200)
      response.assertBodyContains({
        success: true,
        data: {
          id: channelId,
        },
      })
    }

    // Verificar que se crearon todos los canales de Chile
    const totalChannels = await Channel.query().count('* as total').first()
    assert.equal(totalChannels?.$extras.total, CHILE_CHANNEL_IDS.length)
  })
})
