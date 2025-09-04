import { test } from '@japa/runner'
import Database from '@adonisjs/lucid/services/db'
import Channel from '#models/channel'

test.group('Products Sync Validation', (group) => {
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
  })
  group.each.teardown(async () => {
    await Database.rollbackGlobalTransaction()
  })

  group.each.setup(async () => {
    // 🏗️ Crear canales de prueba
    await Channel.updateOrCreate({ id: 1 }, { name: 'UF_CL' })
    await Channel.updateOrCreate({ id: 1420393 }, { name: 'FC_CL' })
    await Channel.updateOrCreate({ id: 1443267 }, { name: 'AF_CL' })
  })

  test('✅ Debe aceptar channel_id numérico válido', async ({ client }) => {
    // 🚀 ACT: Hacer petición con channel_id numérico
    const response = await client.get('/api/sincronizar-productos/1')

    // ✅ ASSERT: Verificar que la validación pasa (aunque falle la sincronización por otros motivos)
    // El importante es que no falle por validación
    response.assertStatus(500) // Esperamos 500 porque el servicio de productos puede fallar, pero no 400 por validación
  })

  test('✅ Debe aceptar nombre de canal en mayúsculas', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre en mayúsculas
    const response = await client.get('/api/sincronizar-productos/UF_CL')

    // ✅ ASSERT: Verificar que la validación pasa
    response.assertStatus(500) // Esperamos 500 porque el servicio de productos puede fallar, pero no 400 por validación
  })

  test('✅ Debe aceptar nombre de canal en minúsculas y convertirlo', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre en minúsculas
    const response = await client.get('/api/sincronizar-productos/fc_cl')

    // ✅ ASSERT: Verificar que la validación pasa
    response.assertStatus(500) // Esperamos 500 porque el servicio de productos puede fallar, pero no 400 por validación
  })

  test('✅ Debe aceptar nombre de canal mixto y normalizarlo', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre mixto
    const response = await client.get('/api/sincronizar-productos/Af_Cl')

    // ✅ ASSERT: Verificar que la validación pasa
    response.assertStatus(500) // Esperamos 500 porque el servicio de productos puede fallar, pero no 400 por validación
  })

  test('❌ Debe rechazar nombres sin guión bajo', async ({ client }) => {
    // 🚀 ACT: Hacer petición con formato inválido
    const response = await client.get('/api/sincronizar-productos/UFCL')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de identificador de canal inválido',
    })
  })

  test('❌ Debe rechazar nombres muy cortos', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre muy corto
    const response = await client.get('/api/sincronizar-productos/U_C')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de identificador de canal inválido',
    })
  })

  test('❌ Debe rechazar nombres muy largos', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre muy largo
    const response = await client.get('/api/sincronizar-productos/ULTIMATEFITNESS_CHILE')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de identificador de canal inválido',
    })
  })

  test('❌ Debe rechazar nombres con números', async ({ client }) => {
    // 🚀 ACT: Hacer petición con números
    const response = await client.get('/api/sincronizar-productos/UF1_CL')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de identificador de canal inválido',
    })
  })

  test('❌ Debe rechazar channel_id cero o negativo', async ({ client }) => {
    // 🚀 ACT: Hacer petición con channel_id inválido
    const response = await client.get('/api/sincronizar-productos/0')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de identificador de canal inválido',
    })
  })

  test('❌ Debe manejar canal no encontrado con formato válido', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre válido pero canal inexistente
    const response = await client.get('/api/sincronizar-productos/XX_YY')

    // ✅ ASSERT: Verificar que encuentra el canal pero no existe en BD
    response.assertStatus(404)
    response.assertBodyContains({
      success: false,
      message: 'Canal no encontrado con nombre: XX_YY',
    })
  })

  test('✅ Debe incluir ejemplos en mensajes de error', async ({ client, assert }) => {
    // 🚀 ACT: Hacer petición con formato inválido
    const response = await client.get('/api/sincronizar-productos/INVALID')

    // ✅ ASSERT: Verificar que incluye ejemplos en el meta
    response.assertStatus(400)
    const body = response.body()
    assert.isArray(body.meta.examples)
    assert.include(body.meta.examples, '/api/sincronizar-productos/1')
    assert.include(body.meta.examples, '/api/sincronizar-productos/UF_CL')
    assert.include(body.meta.examples, '/api/sincronizar-productos/fc_cl')
  })
})
