/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Read replica (opcional). Si no se definen, se usa la misma
  | conexion que el writer. Recomendado en Aurora para lecturas.
  |----------------------------------------------------------
  */
  DB_READER_HOST: Env.schema.string.optional({ format: 'host' }),
  DB_READER_PORT: Env.schema.number.optional(),
  DB_READER_USER: Env.schema.string.optional(),
  DB_READER_PASSWORD: Env.schema.string.optional(),
  DB_READER_DATABASE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Redis (opcional). Cache de lecturas para marcas.
  | Si REDIS_HOST no esta definido, el cache no se usa.
  |----------------------------------------------------------
  */
  REDIS_HOST: Env.schema.string.optional({ format: 'host' }),
  REDIS_PORT: Env.schema.number.optional(),
  REDIS_PASSWORD: Env.schema.string.optional(),
  REDIS_KEY_PREFIX: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for country configuration
  |----------------------------------------------------------
  */
  COUNTRY_CODE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for n8n integration
  |----------------------------------------------------------
  */
  URL_N8N_RESERVES: Env.schema.string.optional(),
  API_N8N_USER: Env.schema.string.optional(),
  VALUE_API_N8N: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Inventario principal por pais (INVENTORY_LOCATION_ID_CL, _CO, _PE, etc.)
  | Si no definido, usa INVENTORY_LOCATION_ID
  |----------------------------------------------------------
  */
  INVENTORY_LOCATION_ID_CL: Env.schema.string.optional(),
  INVENTORY_LOCATION_ID_CO: Env.schema.string.optional(),
  INVENTORY_LOCATION_ID_PE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Inventario reserva por pais (INVENTORY_RESERVE_ID_CL, _CO, _PE, etc.)
  | Si no esta definido para el pais, el cruce de reservas se omite
  |----------------------------------------------------------
  */
  INVENTORY_RESERVE_ID_CL: Env.schema.string.optional(),
  INVENTORY_RESERVE_ID_CO: Env.schema.string.optional(),
  INVENTORY_RESERVE_ID_PE: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Pricing: si tiene price list externo, se usa InternationalPricingStrategy
  | Si no esta definido, se usan precios directos de BigCommerce
  |----------------------------------------------------------
  */
  USE_EXTERNAL_PRICING: Env.schema.boolean.optional(),

  /*
  |----------------------------------------------------------
  | Timer metafield key en BigCommerce (varia por pais/store)
  | Ej: timer_product, timer_product_co, timer_product_pe
  |----------------------------------------------------------
  */
  TIMER_METAFIELD_KEY: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Fuente de quantity: true = usa available_to_sell del inventario
  | false o no definido = usa inventory_level de la variante en BC
  |----------------------------------------------------------
  */
  USE_INVENTORY_QUANTITY: Env.schema.boolean.optional(),

  /*
  |----------------------------------------------------------
  | Store sizes config (JSON con IDs de categorias por tienda)
  | Formato: {"store_name":{"small":id,"medium":id,"big":id},...}
  |----------------------------------------------------------
  */
  STORE_SIZES: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | ID de la categoria raiz "Filtros" para sincronizar filters_products.
  | Si no esta definido, la sync de filtros se omite.
  |----------------------------------------------------------
  */
  ID_ADVANCED: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Packs: ID de categoria con productos pack en BigCommerce.
  | Si no esta definido, la sync de packs se omite.
  |----------------------------------------------------------
  */
  PACKS_CATEGORY_ID: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Packs: key del metafield en producto/variante con items del pack.
  | Default: packs
  |----------------------------------------------------------
  */
  PACKS_METAFIELD_KEY: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Packs Reserve: ID categoria packs (productos en category_products).
  | Si no definido, usa PACKS_CATEGORY_ID.
  |----------------------------------------------------------
  */
  ID_PACKS: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Packs Reserve: ID categoria reserva para asignar packs con serial.
  |----------------------------------------------------------
  */
  ID_RESERVE: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Packs Reserve: ubicacion principal de inventario en BigCommerce.
  | Reserva por pais usa INVENTORY_RESERVE_ID_PE / INVENTORY_RESERVE_ID_CO.
  |----------------------------------------------------------
  */
  INVENTORY_LOCATION_ID: Env.schema.string.optional(),
})
