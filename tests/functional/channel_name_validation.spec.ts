import { test } from '@japa/runner'
import Channel from '#models/channel'
import Database from '@adonisjs/lucid/services/db'

test.group('Channel Name Validation', (group) => {
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
    return () => Database.rollbackGlobalTransaction()
  })

  // 🧪 TEST 1: Nombres válidos en mayúsculas
  test('✅ Debe aceptar nombres válidos en mayúsculas', async ({ client }) => {
    // 📝 ARRANGE: Crear canal de prueba
    await Channel.create({
      id: 1,
      name: 'UF_CL',
    })

    // 🚀 ACT: Hacer petición con nombre en mayúsculas
    const response = await client.get('/api/channels/name/UF_CL')

    // ✅ ASSERT: Verificar respuesta exitosa
    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      data: {
        id: 1,
        name: 'UF_CL',
      },
    })
  })

  // 🧪 TEST 2: Nombres válidos en minúsculas (deben convertirse a mayúsculas)
  test('✅ Debe aceptar nombres válidos en minúsculas y convertirlos', async ({
    client,
    // assert,
  }) => {
    // 📝 ARRANGE: Crear canal de prueba
    await Channel.create({
      id: 1420393,
      name: 'FC_CL',
    })

    // 🚀 ACT: Hacer petición con nombre en minúsculas
    const response = await client.get('/api/channels/name/fc_cl')

    // ✅ ASSERT: Verificar respuesta exitosa
    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      data: {
        id: 1420393,
        name: 'FC_CL',
      },
      meta: {
        originalInput: 'fc_cl',
        validatedInput: 'FC_CL',
      },
    })
  })

  // 🧪 TEST 3: Nombres mixtos (mayúsculas y minúsculas)
  test('✅ Debe aceptar nombres mixtos y normalizarlos', async ({ client }) => {
    // 📝 ARRANGE: Crear canal de prueba
    await Channel.create({
      id: 1443267,
      name: 'AF_CL',
    })

    // 🚀 ACT: Hacer petición con nombre mixto
    const response = await client.get('/api/channels/name/Af_Cl')

    // ✅ ASSERT: Verificar respuesta exitosa
    response.assertStatus(200)
    response.assertBodyContains({
      success: true,
      data: {
        id: 1443267,
        name: 'AF_CL',
      },
      meta: {
        originalInput: 'Af_Cl',
        validatedInput: 'AF_CL',
      },
    })
  })

  // 🧪 TEST 4: Formato inválido - sin guión bajo
  test('❌ Debe rechazar nombres sin guión bajo', async ({ client }) => {
    // 🚀 ACT: Hacer petición con formato inválido
    const response = await client.get('/api/channels/name/UFCL')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de nombre de canal inválido',
      errors: [
        {
          field: 'name',
          message: 'El nombre del canal debe tener la estructura MARCA_PAIS (ej: UF_CL, FC_CL)',
        },
      ],
      meta: {
        input: 'UFCL',
        expectedFormat: 'MARCA_PAIS (ej: UF_CL, FC_CL, AF_CL)',
      },
    })
  })

  // 🧪 TEST 5: Formato inválido - muy corto
  test('❌ Debe rechazar nombres muy cortos', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre muy corto
    const response = await client.get('/api/channels/name/U_C')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de nombre de canal inválido',
      errors: [
        {
          field: 'name',
          message: 'El nombre del canal debe tener la estructura MARCA_PAIS (ej: UF_CL, FC_CL)',
        },
      ],
    })
  })

  // 🧪 TEST 6: Formato inválido - muy largo
  test('❌ Debe rechazar nombres muy largos', async ({ client }) => {
    // 🚀 ACT: Hacer petición con nombre muy largo
    const response = await client.get('/api/channels/name/ULTIMATEFITNESS_CHILE')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de nombre de canal inválido',
    })
  })

  // 🧪 TEST 7: Formato inválido - con números
  test('❌ Debe rechazar nombres con números', async ({ client }) => {
    // 🚀 ACT: Hacer petición con números
    const response = await client.get('/api/channels/name/UF1_CL')

    // ✅ ASSERT: Verificar error de validación
    response.assertStatus(400)
    response.assertBodyContains({
      success: false,
      message: 'Formato de nombre de canal inválido',
    })
  })

  // 🧪 TEST 8: Canal no encontrado (formato válido pero no existe)
  test('❌ Debe manejar canal no encontrado con formato válido', async ({ client }) => {
    // 🚀 ACT: Hacer petición con formato válido pero canal inexistente
    const response = await client.get('/api/channels/name/XX_YY')

    // ✅ ASSERT: Verificar canal no encontrado
    response.assertStatus(404)
    response.assertBodyContains({
      success: false,
      message: 'Canal no encontrado con nombre: XX_YY',
      data: null,
      meta: {
        originalInput: 'XX_YY',
        validatedInput: 'XX_YY',
      },
    })
  })
})
