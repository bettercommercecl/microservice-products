import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import { Redis } from 'ioredis'
import type { CacheProvider } from '#ports/cache_provider.port'

/**
 * Implementacion Redis del puerto de cache.
 * Si REDIS_HOST no esta definido, todas las devuelven null.
 */
type RedisClient = InstanceType<typeof Redis>

export default class CacheService implements CacheProvider {
  private static client: RedisClient | null = null
  private static keyPrefix: string = 'products_ms:'

  private static getClient(): RedisClient | null {
    if (CacheService.client) return CacheService.client
    const host = env.get('REDIS_HOST')
    if (!host) return null
    try {
      CacheService.client = new Redis({
        host,
        port: env.get('REDIS_PORT') ?? 6379,
        password: env.get('REDIS_PASSWORD') ?? undefined,
        keyPrefix: env.get('REDIS_KEY_PREFIX') ?? CacheService.keyPrefix,
        retryStrategy: (times: number) => (times <= 3 ? Math.min(500 * times, 2000) : null),
      })
      CacheService.client.on('error', (err: Error) => {
        Logger.warn({ err: err.message }, 'Redis connection error')
      })
      return CacheService.client
    } catch (err) {
      Logger.warn({ err }, 'Redis init failed, cache disabled')
      return null
    }
  }

  private static key(k: string): string {
    const prefix = env.get('REDIS_KEY_PREFIX') ?? CacheService.keyPrefix
    return prefix + k
  }

  async get(key: string): Promise<string | null> {
    const client = CacheService.getClient()
    if (!client) return null
    try {
      return await client.get(key)
    } catch (err) {
      Logger.warn({ key, err: (err as Error).message }, 'Cache get error')
      return null
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = CacheService.getClient()
    if (!client) return
    try {
      if (ttlSeconds && ttlSeconds > 0) {
        await client.setex(key, ttlSeconds, value)
      } else {
        await client.set(key, value)
      }
    } catch (err) {
      Logger.warn({ key, err: (err as Error).message }, 'Cache set error')
    }
  }

  async del(key: string): Promise<void> {
    const client = CacheService.getClient()
    if (!client) return
    try {
      await client.del(key)
    } catch (err) {
      Logger.warn({ key, err: (err as Error).message }, 'Cache del error')
    }
  }

  /**
   * Invalida todas las claves que empiezan con el prefijo (ej. tras sync).
   */
  async invalidateByPrefix(prefix: string): Promise<void> {
    const client = CacheService.getClient()
    if (!client) return
    try {
      const fullPrefix = CacheService.key(prefix)
      const keys = await client.keys(`${fullPrefix}*`)
      if (keys.length === 0) return
      const keyPrefix = env.get('REDIS_KEY_PREFIX') ?? CacheService.keyPrefix
      const keysWithoutPrefix = keys.map((k: string) =>
        k.startsWith(keyPrefix) ? k.slice(keyPrefix.length) : k
      )
      await client.del(...keysWithoutPrefix)
      Logger.info({ prefix, count: keys.length }, 'Cache invalidated by prefix')
    } catch (err) {
      Logger.warn({ prefix, err: (err as Error).message }, 'Cache invalidateByPrefix error')
    }
  }
}
