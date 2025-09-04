import { test } from '@japa/runner'
import ChannelsController from '#controllers/channels_controller'
import Channel from '#models/channel'
import { channels as channelsConfig } from '../../app/utils/channels/channels.js'
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
  //1724574, // MK (Muu Kids) Chile
]

test.group('ChannelsController - Tests Unitarios (Chile)', (group) => {
  // 🧹 SETUP: Limpiar base de datos antes de cada test usando transacciones
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
    return () => Database.rollbackGlobalTransaction()
  })

  // 🧪 TEST 1: Verificar inicialización del controlador
  test('🏗️ Inicialización - Debe inicializar controlador correctamente', async ({ assert }) => {
    // 🚀 ACT: Crear instancia del controlador
    const controller = new ChannelsController()

    // ✅ ASSERT: Verificar que se inicializa correctamente
    assert.isObject(controller)
    assert.property(controller, 'logger')
  })

  // 🧪 TEST 2: Verificar método index con canales de Chile
  test('🔍 Método index - Debe retornar canales de Chile ordenados por ID', async ({ assert }) => {
    // 📝 ARRANGE: Crear canales de Chile con channel_id reales
    const chileChannels = [
      { id: 1443267, name: 'AF_CL' }, // Aqua Force Chile
      { id: 1, name: 'UF_CL' }, // Ultimate Fitness Chile
      { id: 1420393, name: 'FC_CL' }, // First Care Chile
      { id: 1461778, name: 'TS_CL' }, // TSpin Chile
      { id: 1457601, name: 'TF_CL' }, // Terra Force Chile
    ]

    // Usar updateOrCreate para evitar conflictos de claves duplicadas
    for (const channel of chileChannels) {
      await Channel.updateOrCreate({ id: channel.id }, channel)
    }

    // 🚀 ACT: Crear controlador y simular contexto
    const controller = new ChannelsController()
    let mockResult: any = null
    const mockResponse = {
      ok: (data: any) => {
        mockResult = data
        return data
      },
    }

    await controller.index({ response: mockResponse } as any)

    // ✅ ASSERT: Verificar resultado
    assert.isObject(mockResult)
    assert.property(mockResult, 'success')
    assert.property(mockResult, 'data')
    assert.property(mockResult, 'meta')
    assert.isTrue(mockResult.success)
    assert.isArray(mockResult.data)
    assert.equal(mockResult.data.length, 5)

    // Verificar ordenamiento por ID
    assert.equal(mockResult.data[0].id, 1)
    assert.equal(mockResult.data[1].id, 1420393)
    assert.equal(mockResult.data[2].id, 1443267)
    assert.equal(mockResult.data[3].id, 1457601)
    assert.equal(mockResult.data[4].id, 1461778)
  })

  // 🧪 TEST 3: Verificar método show con canal existente
  test('🔍 Método show - Debe retornar canal específico', async ({ assert }) => {
    // 📝 ARRANGE: Crear canal de prueba
    const testChannel = await Channel.create({
      id: 1,
      name: 'UF_CL',
    })

    // 🚀 ACT: Crear controlador y simular contexto
    const controller = new ChannelsController()
    let mockResult: any = null
    const mockResponse = {
      ok: (data: any) => {
        mockResult = data
        return data
      },
      notFound: (data: any) => {
        mockResult = data
        return data
      },
    }

    await controller.show({
      params: { id: 1 },
      response: mockResponse,
    } as any)

    // ✅ ASSERT: Verificar resultado
    assert.isObject(mockResult)
    assert.property(mockResult, 'success')
    assert.property(mockResult, 'data')
    assert.isTrue(mockResult.success)
    assert.equal(mockResult.data.id, testChannel.id)
    assert.equal(mockResult.data.name, testChannel.name)
  })

  // 🧪 TEST 4: Verificar método show con canal inexistente
  test('🔍 Método show - Debe manejar canal inexistente', async ({ assert }) => {
    // 🚀 ACT: Crear controlador y simular contexto
    const controller = new ChannelsController()
    let mockResult: any = null
    const mockResponse = {
      ok: (data: any) => {
        mockResult = data
        return data
      },
      notFound: (data: any) => {
        mockResult = data
        return data
      },
    }

    await controller.show({
      params: { id: 999 },
      response: mockResponse,
    } as any)

    // ✅ ASSERT: Verificar resultado
    assert.isObject(mockResult)
    assert.property(mockResult, 'success')
    assert.property(mockResult, 'message')
    assert.isFalse(mockResult.success)
    assert.equal(mockResult.message, 'Canal no encontrado')
    assert.isNull(mockResult.data)
  })

  // 🧪 TEST 5: Verificar método sync con configuración válida
  test('🔄 Método sync - Debe sincronizar canales desde configuración', async ({ assert }) => {
    // 🚀 ACT: Crear controlador y simular contexto
    const controller = new ChannelsController()
    let mockResult: any = null
    const mockResponse = {
      ok: (data: any) => {
        mockResult = data
        return data
      },
    }

    await controller.sync({ response: mockResponse } as any)

    // ✅ ASSERT: Verificar resultado
    assert.isObject(mockResult)
    assert.property(mockResult, 'success')
    assert.property(mockResult, 'message')
    assert.property(mockResult, 'data')
    assert.property(mockResult, 'meta')
    assert.isTrue(mockResult.success)
    assert.equal(mockResult.message, 'Sincronización de canales completada exitosamente')

    // Verificar estructura de datos
    assert.property(mockResult.data, 'created')
    assert.property(mockResult.data, 'updated')
    assert.property(mockResult.data, 'errors')
    assert.isArray(mockResult.data.errors)

    // Verificar que se crearon canales
    const totalChannels = await Channel.query().count('* as total').first()
    assert.isAbove(Number(totalChannels?.$extras.total) || 0, 0)
  })

  // 🧪 TEST 7: Verificar configuración de canales
  test('⚙️ Configuración - Debe usar configuración correcta', async ({ assert }) => {
    // ✅ ASSERT: Verificar que la configuración existe
    assert.isObject(channelsConfig)
    assert.property(channelsConfig, 'UF')
    assert.property(channelsConfig, 'FC')
    assert.property(channelsConfig, 'AF')

    // Verificar estructura de configuración
    assert.property(channelsConfig.UF, 'CL')
    assert.property(channelsConfig.UF.CL, 'CHANNEL')
    assert.isNumber(channelsConfig.UF.CL.CHANNEL)
  })

  // 🧪 TEST 8: Verificar integridad de datos
  test('🔒 Integridad de datos - Debe mantener integridad', async ({ assert }) => {
    // 📝 ARRANGE: Crear canales con IDs específicos
    const channels = [
      { id: 1, name: 'UF_CL' },
      { id: 2, name: 'FC_CL' },
      { id: 3, name: 'AF_CL' },
    ]

    // Usar updateOrCreate para evitar conflictos de claves duplicadas
    for (const channel of channels) {
      await Channel.updateOrCreate({ id: channel.id }, channel)
    }

    // 🚀 ACT: Verificar que se crearon correctamente
    const createdChannels = await Channel.query().orderBy('id', 'asc')

    // ✅ ASSERT: Verificar integridad
    assert.equal(createdChannels.length, 3)
    assert.equal(createdChannels[0].id, 1)
    assert.equal(createdChannels[1].id, 2)
    assert.equal(createdChannels[2].id, 3)

    // Verificar que los nombres son únicos
    const names = createdChannels.map((c) => c.name)
    const uniqueNames = [...new Set(names)]
    assert.equal(names.length, uniqueNames.length)
  })

  // 🧪 TEST 9: Verificar canales específicos de Chile
  test('🇨🇱 Canales de Chile - Debe validar todos los channel_id de Chile', async ({ assert }) => {
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

    // 🚀 ACT: Verificar que se crearon todos los canales de Chile
    const createdChannels = await Channel.query().orderBy('id', 'asc')

    // ✅ ASSERT: Verificar que se crearon al menos los canales de Chile esperados
    assert.isAbove(createdChannels.length, CHILE_CHANNEL_IDS.length - 1)

    // Verificar que cada channel_id de Chile existe
    for (const channelId of CHILE_CHANNEL_IDS) {
      const channel = createdChannels.find((c) => c.id === channelId)
      assert.isNotNull(channel, `Canal con ID ${channelId} no encontrado`)
      assert.include(channel?.name, '_CL', `Canal ${channelId} no tiene sufijo _CL`)
    }

    // Verificar que todos los canales tienen nombres únicos
    const names = createdChannels.map((c) => c.name)
    const uniqueNames = [...new Set(names)]
    assert.equal(names.length, uniqueNames.length)
  })
})
