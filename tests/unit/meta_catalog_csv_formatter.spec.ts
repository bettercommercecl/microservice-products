import {
  buildMetaCatalogRows,
  formatMetaCatalogPrice,
  generateMetaCatalogCsv,
  plainMetaCatalogDescription,
  type MetaCatalogProductInput,
} from '#application/formatters/meta_catalog_csv_formatter'
import { test } from '@japa/runner'

test.group('meta_catalog_csv_formatter', () => {
  test('formatMetaCatalogPrice redondea y agrega moneda', ({ assert }) => {
    assert.equal(formatMetaCatalogPrice('CLP', 99999.9), '99999.9 CLP')
  })

  test('plainMetaCatalogDescription limpia HTML y saltos de linea', ({ assert }) => {
    const result = plainMetaCatalogDescription('<p>Hola&nbsp;mundo</p>\n')
    assert.equal(result, 'Hola mundo')
  })

  test('buildMetaCatalogRows excluye titulos con Outlet', ({ assert }) => {
    const products: MetaCatalogProductInput[] = [
      {
        productId: 1,
        title: 'Outlet Zapatillas',
        pageTitle: '',
        description: 'desc',
        url: '/zapatillas',
        brandName: 'Marca',
        variants: [
          {
            sku: 'SKU-1',
            image: 'https://img.test/1.jpg',
            normalPrice: 10000,
            discountPrice: 9000,
            availableToSell: 5,
            optionLabels: [],
            isFirstVariant: true,
          },
        ],
      },
    ]

    const rows = buildMetaCatalogRows(products, 'https://tienda.cl', 'CLP')
    assert.lengthOf(rows, 0)
  })

  test('buildMetaCatalogRows genera una fila por variante', ({ assert }) => {
    const products: MetaCatalogProductInput[] = [
      {
        productId: 10,
        title: 'Polera',
        pageTitle: 'Polera deportiva',
        description: '<strong>Polera</strong> comoda',
        url: '/polera',
        brandName: 'UF',
        variants: [
          {
            sku: 'SKU-A',
            image: 'https://img.test/a.jpg',
            normalPrice: 20000,
            discountPrice: 15000,
            availableToSell: 2,
            optionLabels: [],
            isFirstVariant: true,
          },
          {
            sku: 'SKU-B',
            image: 'https://img.test/b.jpg',
            normalPrice: 20000,
            discountPrice: 0,
            availableToSell: 0,
            optionLabels: ['Rojo', 'L'],
            isFirstVariant: false,
          },
        ],
      },
    ]

    const rows = buildMetaCatalogRows(products, 'https://ultimatefitness.cl', 'CLP')
    assert.lengthOf(rows, 2)
    assert.equal(rows[0].id, 'SKU-A')
    assert.equal(rows[0].availability, 'in stock')
    assert.equal(rows[0].price, '15000 CLP')
    assert.equal(rows[0].link, 'https://ultimatefitness.cl/producto/polera?id=10')
    assert.equal(rows[1].title, 'Polera - Rojo-L')
    assert.equal(rows[1].availability, 'out of stock')
  })

  test('generateMetaCatalogCsv escapa comillas en CSV', ({ assert }) => {
    const csv = generateMetaCatalogCsv([
      {
        id: 'SKU-1',
        title: 'Producto "Pro"',
        description: 'Desc',
        availability: 'in stock',
        condition: 'new',
        price: '1000 CLP',
        link: 'https://tienda.cl/producto/x?id=1',
        image_link: 'https://img.test/1.jpg',
        brand: 'UF',
      },
    ])

    assert.include(csv, '"Producto ""Pro"""')
    assert.include(csv, '"id"')
  })
})
