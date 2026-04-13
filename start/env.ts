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
  URL_N8N_RESERVES_CL: Env.schema.string.optional(),
  URL_N8N_RESERVES_CO: Env.schema.string.optional(),
  URL_N8N_RESERVES_PE: Env.schema.string.optional(),
  API_N8N_USER: Env.schema.string.optional(),
  VALUE_API_N8N: Env.schema.string.optional(),
  /** Webhook n8n para alertas de fallos en sincronizacion (POST JSON title/reference/message) */
  URL_N8N_NOTIFICATIONS: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Listados paginados (GET): tope máximo de ?limit / ?per_page (default 10000)
  |----------------------------------------------------------
  */
  PAGINATION_MAX_LIMIT: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | M2M auth: API key enviada en Authorization
  |----------------------------------------------------------
  */
  M2M_API_KEY_CURRENT: Env.schema.string(),
  M2M_API_KEY_PREVIOUS: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Legacy: API key para integraciones externas
  |----------------------------------------------------------
  */
  X_API_KEY: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Inventario principal por pais (INVENTORY_LOCATION_ID_CL, _CO, _PE).
  | Requerido para sync de stock, pack reserve e inventario BigCommerce.
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
  | Pricing (legacy): antes activaba precios via microservicio externo.
  | La sync usa el price list de BigCommerce por lote; variable opcional por compatibilidad.
  |----------------------------------------------------------
  */
  USE_EXTERNAL_PRICING: Env.schema.boolean.optional(),

  /*
  |----------------------------------------------------------
  | Purga por price list (PE/CO): maximo ratio excluidos/catalogo BC antes de abortar.
  | El catalogo BC suele ser mas amplio que el price list del pais; 0.5 era demasiado bajo.
  | Default 0.85 si no se define. Rango recomendado 0.7 a 0.95.
  |----------------------------------------------------------
  */
  PRICELIST_PURGE_MAX_EXCLUDED_RATIO: Env.schema.number.optional(),

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
  | ID de la categoria raiz "Filtros" para sincronizar filters_products.
  | Si no esta definido, la sync de filtros se omite.
  |----------------------------------------------------------
  */
  ID_ADVANCED: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Packs: key del metafield en producto/variante con items del pack.
  | Default: packs
  |----------------------------------------------------------
  */
  PACKS_METAFIELD_KEY: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Packs: ID de categoria con productos pack en BigCommerce.
  | Usado en sync de packs, pack reserve y formateo (reserve en packs).
  | Si no esta definido, la sync de packs se omite.
  |----------------------------------------------------------
  */
  ID_PACKS: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Packs Reserve: ID categoria reserva para asignar packs con serial.
  | Tambien usado en logica nextday y condicion de reserve (formato marcas).
  |----------------------------------------------------------
  */
  ID_RESERVE: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Categorias por canal (IDs para booleanos en formateo tipo marcas).
  | Si el producto tiene la categoria, el flag es true.
  |----------------------------------------------------------
  */
  ID_SAMEDAY: Env.schema.number.optional(),
  ID_NEXTDAY: Env.schema.number.optional(),
  ID_24HORAS: Env.schema.number.optional(),
  ID_FREE_SHIPPING: Env.schema.number.optional(),
  ID_PICKUP_IN_STORE: Env.schema.number.optional(),
  ID_TURBO: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Precio transferencia: porcentaje de descuento para cash_price.
  | Usado en formateo productos por canal (marcas).
  |----------------------------------------------------------
  */
  PERCENT_DISCOUNT_TRANSFER_PRICE: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Sizes por tienda (getSizesByProduct): IDs de categorias small/medium/big.
  | Por pais: CL (napoleon, vitacura, condor, quilicura, vina, concon, concepcion,
  | retirocondes, condes), PE (buenaventura, urbano, surco, miraflores, sanmiguel, sanjuan),
  | CO (fulppi, bogota). Sin definir = false en ese tamano.
  |----------------------------------------------------------
  */
  ID_SMALL_NAPOLEON: Env.schema.number.optional(),
  ID_MEDIUM_NAPOLEON: Env.schema.number.optional(),
  ID_BIG_NAPOLEON: Env.schema.number.optional(),
  ID_SMALL_VITACURA: Env.schema.number.optional(),
  ID_MEDIUM_VITACURA: Env.schema.number.optional(),
  ID_BIG_VITACURA: Env.schema.number.optional(),
  ID_SMALL_CONDOR: Env.schema.number.optional(),
  ID_MEDIUM_CONDOR: Env.schema.number.optional(),
  ID_BIG_CONDOR: Env.schema.number.optional(),
  ID_SMALL_QUILICURA: Env.schema.number.optional(),
  ID_MEDIUM_QUILICURA: Env.schema.number.optional(),
  ID_BIG_QUILICURA: Env.schema.number.optional(),
  ID_SMALL_VINA: Env.schema.number.optional(),
  ID_MEDIUM_VINA: Env.schema.number.optional(),
  ID_BIG_VINA: Env.schema.number.optional(),
  ID_SMALL_CONCON: Env.schema.number.optional(),
  ID_MEDIUM_CONCON: Env.schema.number.optional(),
  ID_BIG_CONCON: Env.schema.number.optional(),
  ID_SMALL_CONCEPCION: Env.schema.number.optional(),
  ID_MEDIUM_CONCEPCION: Env.schema.number.optional(),
  ID_BIG_CONCEPCION: Env.schema.number.optional(),
  ID_SMALL_RETIROCONDES: Env.schema.number.optional(),
  ID_MEDIUM_RETIROCONDES: Env.schema.number.optional(),
  ID_BIG_RETIROCONDES: Env.schema.number.optional(),
  ID_SMALL_CONDES: Env.schema.number.optional(),
  ID_MEDIUM_CONDES: Env.schema.number.optional(),
  ID_BIG_CONDES: Env.schema.number.optional(),
  ID_SMALL_BUENAVENTURA: Env.schema.number.optional(),
  ID_MEDIUM_BUENAVENTURA: Env.schema.number.optional(),
  ID_BIG_BUENAVENTURA: Env.schema.number.optional(),
  ID_SMALL_URBANO: Env.schema.number.optional(),
  ID_MEDIUM_URBANO: Env.schema.number.optional(),
  ID_BIG_URBANO: Env.schema.number.optional(),
  ID_SMALL_SURCO: Env.schema.number.optional(),
  ID_MEDIUM_SURCO: Env.schema.number.optional(),
  ID_BIG_SURCO: Env.schema.number.optional(),
  ID_SMALL_MIRAFLORES: Env.schema.number.optional(),
  ID_MEDIUM_MIRAFLORES: Env.schema.number.optional(),
  ID_BIG_MIRAFLORES: Env.schema.number.optional(),
  ID_SMALL_SANMIGUEL: Env.schema.number.optional(),
  ID_MEDIUM_SANMIGUEL: Env.schema.number.optional(),
  ID_BIG_SANMIGUEL: Env.schema.number.optional(),
  ID_SMALL_SANJUAN: Env.schema.number.optional(),
  ID_MEDIUM_SANJUAN: Env.schema.number.optional(),
  ID_BIG_SANJUAN: Env.schema.number.optional(),
  ID_SMALL_FULPPI: Env.schema.number.optional(),
  ID_MEDIUM_FULPPI: Env.schema.number.optional(),
  ID_BIG_FULPPI: Env.schema.number.optional(),
  ID_SMALL_BOGOTA: Env.schema.number.optional(),
  ID_MEDIUM_BOGOTA: Env.schema.number.optional(),
  ID_BIG_BOGOTA: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Webhooks post-sync (notificacion a marcas / storefront)
  | URL: {API_URL del canal en utils/channels}/api/webhook-sync-products
  | Cabecera x-api-key y firma HMAC opcional con esta misma clave
  |----------------------------------------------------------
  */
  SYNC_WEBHOOKS_ENABLED: Env.schema.boolean.optional(),
  /** Timeout del POST; debe cubrir lock del destino + respuesta (default en codigo ~330s si no se define) */
  SYNC_WEBHOOK_TIMEOUT_MS: Env.schema.number.optional(),
  /** Pausa entre canales en fan-out global (default en codigo 60_000 ms = 1 min) */
  SYNC_WEBHOOK_GLOBAL_STAGGER_MS: Env.schema.number.optional(),
  /** Entre reintentos tras fallo (409, timeout, etc.); alinear con lock del storefront (ej. bigcommerceSyncLock:300 -> 300000) */
  SYNC_WEBHOOK_RETRY_AFTER_MS: Env.schema.number.optional(),
  /** GET a search_index_refresh_url tras sync. false desactiva; si no se define, activo */
  SEARCH_INDEX_REFRESH_ENABLED: Env.schema.boolean.optional(),
  /** Timeout por GET de refresco de indice (default 60_000 ms) */
  SEARCH_INDEX_REFRESH_TIMEOUT_MS: Env.schema.number.optional(),
  API_KEY_BRANDS: Env.schema.string.optional(),
  /** Alias opcional de API_KEY_BRANDS (mismo uso que x-api-key en webhooks de marcas) */
})
