import env from '#start/env'

/**
 * Configuracion Redis para cache de lecturas.
 * El CacheService solo conecta si REDIS_HOST esta definido.
 */
export default {
  connection: 'default',
  connections: {
    default: {
      host: env.get('REDIS_HOST') ?? '127.0.0.1',
      port: env.get('REDIS_PORT') ?? 6379,
      password: env.get('REDIS_PASSWORD') ?? undefined,
      keyPrefix: env.get('REDIS_KEY_PREFIX') ?? 'products_ms:',
    },
  },
}
