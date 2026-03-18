import type { HttpContext } from '@adonisjs/core/http'
import Logger from '@adonisjs/core/services/logger'
import type { NextFn } from '@adonisjs/core/types/http'

export interface RateLimitOptions {
  /** Maximo de requests permitidos en la ventana */
  max: number
  /** Ventana en milisegundos (ej. 600_000 = 10 min) */
  windowMs: number
  /** Clave del limite: por IP o global para la ruta */
  key?: 'ip' | 'global'
}

interface Bucket {
  count: number
  firstRequestAt: number
}

const store = new Map<string, Bucket>()

function getBucketKey(options: Required<RateLimitOptions>, identifier: string): string {
  const keyType = options.key
  const id = keyType === 'global' ? 'global' : identifier
  return `rl:${options.max}:${options.windowMs}:${keyType}:${id}`
}

function pruneExpired(now: number, windowMs: number): void {
  for (const [key, bucket] of store.entries()) {
    if (bucket.firstRequestAt + windowMs < now) store.delete(key)
  }
}

/**
 * IP del cliente teniendo en cuenta proxy inverso (Nginx).
 */
function getClientIdentifier(ctx: HttpContext): string {
  const forwarded = ctx.request.header('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = ctx.request.header('x-real-ip')?.trim()
  if (realIp) return realIp
  return ctx.request.ip() ?? 'unknown'
}

/**
 * Rate limit por ruta
 * Opciones se pasan al aplicar el middleware: .use(middleware.rateLimit({ max, windowMs, key })).
 * Detras de proxy inverso (Nginx) la IP se obtiene de X-Forwarded-For / X-Real-IP.
 */
export default class RateLimitMiddleware {
  private readonly logger = Logger.child({ service: 'RateLimitMiddleware' })

  async handle(ctx: HttpContext, next: NextFn, options: RateLimitOptions): Promise<void> {
    const opts: Required<RateLimitOptions> = {
      max: options.max,
      windowMs: options.windowMs,
      key: options.key ?? 'ip',
    }

    const now = Date.now()
    const { max, windowMs, key } = opts
    const identifier = key === 'ip' ? getClientIdentifier(ctx) : ''
    const bucketKey = getBucketKey(opts, identifier)

    pruneExpired(now, windowMs)

    let bucket = store.get(bucketKey)
    if (!bucket || bucket.firstRequestAt + windowMs < now) {
      bucket = { count: 1, firstRequestAt: now }
      store.set(bucketKey, bucket)
    } else {
      bucket.count += 1
    }

    if (bucket.count > max) {
      const retryAfterSec = Math.ceil((bucket.firstRequestAt + windowMs - now) / 1000)
      this.logger.warn(
        { bucketKey, count: bucket.count, max, retryAfterSec },
        'Rate limit excedido'
      )
      ctx.response.status(429).header('Retry-After', String(retryAfterSec)).send({
        success: false,
        message: 'Demasiadas solicitudes. Reintente mas tarde.',
        retryAfterSeconds: retryAfterSec,
      })
      return
    }

    await next()
  }
}
