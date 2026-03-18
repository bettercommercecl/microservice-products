import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import env from '#start/env'

function extractAuthorizationToken(authorizationHeader?: string): string | null {
  if (!authorizationHeader) return null

  const raw = authorizationHeader.trim()
  if (!raw) return null

  const lower = raw.toLowerCase()
  if (lower.startsWith('bearer ')) {
    const token = raw.slice(7).trim()
    return token || null
  }

  return raw
}

export default class M2mAuthMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const token = extractAuthorizationToken(ctx.request.header('authorization'))

    const currentKey = env.get('M2M_API_KEY_CURRENT')
    const previousKey = env.get('M2M_API_KEY_PREVIOUS')

    if (!token || (token !== currentKey && token !== previousKey)) {
      return ctx.response.unauthorized({
        success: false,
        message: 'Unauthorized',
      })
    }

    return next()
  }
}
