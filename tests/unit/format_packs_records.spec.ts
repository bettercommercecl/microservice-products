import {
    formatPacksRecords,
    type InventoryEntry,
    type PackInput,
} from '#utils/format_packs_records'
import { test } from '@japa/runner'

test.group('formatPacksRecords', () => {
  test('pack simple: usa variant_id desde inventory cuando item no lo tiene', ({ assert }) => {
    const packs: PackInput[] = [
      {
        id: 100,
        items_packs: [
          { product: 'SKU-A', quantity: 2 },
          { product: 'SKU-B', quantity: 1 },
        ],
      },
    ]

    const inventoryMap = new Map<string, InventoryEntry>([
      [
        'SKU-A',
        {
          product_id: 10,
          sku: 'SKU-A',
          safety_stock: 0,
          available_to_sell: 5,
          variant_id: 101,
          bin_picking_number: 'BP-A',
        },
      ],
      [
        'SKU-B',
        {
          product_id: 20,
          sku: 'SKU-B',
          safety_stock: 1,
          available_to_sell: 3,
          variant_id: 102,
          bin_picking_number: null,
        },
      ],
    ])

    const variantReserveMap = new Map<string, string | null>([
      ['SKU-A', 'reserve-a'],
      ['SKU-B', null],
    ])

    const result = formatPacksRecords(packs, inventoryMap, variantReserveMap)

    assert.lengthOf(result, 2)
    assert.equal(result[0].line_index, 0)
    assert.equal(result[1].line_index, 1)
    assert.equal(result[0].pack_id, 100)
    assert.equal(result[0].product_id, 10)
    assert.equal(result[0].sku, 'SKU-A')
    assert.equal(result[0].stock, 5)
    assert.equal(result[0].quantity, 2)
    assert.isFalse(result[0].is_variant)
    assert.equal(result[0].variant_id, 101)
    assert.equal(result[0].serial, 'BP-A')
    assert.equal(result[0].reserve, 'reserve-a')

    assert.equal(result[1].variant_id, 102)
    assert.isNull(result[1].reserve)
  })

  test('pack variantes: is_variant desde item, variant_id siempre desde inventario (hijo)', ({
    assert,
  }) => {
    const packs: PackInput[] = [
      {
        id: 200,
        items_packs: [
          {
            product: 'SKU-X',
            quantity: 1,
            is_variant: true,
            variant_id: 999,
          },
        ],
      },
    ]

    const inventoryMap = new Map<string, InventoryEntry>([
      [
        'SKU-X',
        {
          product_id: 30,
          sku: 'SKU-X',
          safety_stock: 0,
          available_to_sell: 10,
          variant_id: 88,
          bin_picking_number: null,
        },
      ],
    ])

    const variantReserveMap = new Map<string, string | null>()

    const result = formatPacksRecords(packs, inventoryMap, variantReserveMap)

    assert.lengthOf(result, 1)
    assert.equal(result[0].line_index, 0)
    assert.isTrue(result[0].is_variant)
    assert.equal(result[0].variant_id, 88)
  })

  test('misma variante en dos lineas: line_index distinto, mismo variant_id', ({ assert }) => {
    const packs: PackInput[] = [
      {
        id: 600,
        items_packs: [
          { product: 'SKU-DUP', quantity: 1 },
          { product: 'SKU-DUP', quantity: 3 },
        ],
      },
    ]
    const inventoryMap = new Map<string, InventoryEntry>([
      [
        'SKU-DUP',
        {
          product_id: 60,
          sku: 'SKU-DUP',
          safety_stock: 0,
          available_to_sell: 10,
          variant_id: 6001,
          bin_picking_number: null,
        },
      ],
    ])
    const result = formatPacksRecords(packs, inventoryMap, new Map())
    assert.lengthOf(result, 2)
    assert.equal(result[0].line_index, 0)
    assert.equal(result[1].line_index, 1)
    assert.equal(result[0].variant_id, 6001)
    assert.equal(result[1].variant_id, 6001)
    assert.equal(result[0].quantity, 1)
    assert.equal(result[1].quantity, 3)
  })

  test('stock 0 cuando quantity supera available_to_sell', ({ assert }) => {
    const packs: PackInput[] = [
      {
        id: 300,
        items_packs: [{ product: 'SKU-LOW', quantity: 10 }],
      },
    ]

    const inventoryMap = new Map<string, InventoryEntry>([
      [
        'SKU-LOW',
        {
          product_id: 40,
          sku: 'SKU-LOW',
          safety_stock: 2,
          available_to_sell: 3,
          variant_id: 401,
          bin_picking_number: null,
        },
      ],
    ])

    const result = formatPacksRecords(packs, inventoryMap, new Map())

    assert.lengthOf(result, 1)
    assert.equal(result[0].line_index, 0)
    assert.equal(result[0].stock, 0)
  })

  test('omite items sin SKU valido o sin inventario', ({ assert }) => {
    const packs: PackInput[] = [
      {
        id: 400,
        items_packs: [
          { product: 'SKU-OK', quantity: 1 },
          { product: '', quantity: 1 },
          { product: 'SKU-MISSING', quantity: 1 },
        ],
      },
    ]

    const inventoryMap = new Map<string, InventoryEntry>([
      [
        'SKU-OK',
        {
          product_id: 50,
          sku: 'SKU-OK',
          safety_stock: 0,
          available_to_sell: 5,
          variant_id: 501,
          bin_picking_number: null,
        },
      ],
    ])

    const result = formatPacksRecords(packs, inventoryMap, new Map())

    assert.lengthOf(result, 1)
    assert.equal(result[0].line_index, 0)
    assert.equal(result[0].sku, 'SKU-OK')
  })

  test('retorna array vacio para packs sin items', ({ assert }) => {
    const packs: PackInput[] = [{ id: 500, items_packs: [] }, { id: 501 }]

    const result = formatPacksRecords(packs, new Map(), new Map())

    assert.lengthOf(result, 0)
  })
})
