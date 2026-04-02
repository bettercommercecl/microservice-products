import Channel from '#models/channel'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import axios, { type AxiosError } from 'axios'
import { createHmac, randomUUID } from 'node:crypto'

export type SyncWebhookEvent =
  | 'brands_sync_completed'
  | 'categories_sync_completed'
  | 'products_sync_completed'
  | 'packs_sync_completed'
  | 'packs_reserve_sync_completed'
  | 'stock_sync_completed'
  | 'full_sync_completed'

export type SyncWebhookSource = 'standalone' | 'full_sync'

export interface SyncWebhookPayload {
  event_id: string
  event: SyncWebhookEvent
  scope: 'global' | 'channel'
  channel_id?: number | null
  channel_name?: string | null
  country_code: string
  occurred_at: string
  success: boolean
  source?: SyncWebhookSource
  message?: string
  meta?: Record<string, unknown>
}

export interface NotifyWebhookOptions {
  success: boolean
  source?: SyncWebhookSource
  message?: string
  meta?: Record<string, unknown>
}

const logger = Logger.child({ service: 'SyncWebhookNotifier' })

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function webhooksGloballyEnabled(): boolean {
  return env.get('SYNC_WEBHOOKS_ENABLED') !== false
}

/** Alineado con lock tipico en destino (webhook-sync:300 s); reintentos antes no liberaban el lock. */
const DEFAULT_WEBHOOK_RETRY_AFTER_MS = 300_000
/** Lock + margen para que axios no cancele antes de recibir respuesta. */
const DEFAULT_WEBHOOK_TIMEOUT_MS = 330_000

function timeoutMs(): number {
  return env.get('SYNC_WEBHOOK_TIMEOUT_MS') ?? DEFAULT_WEBHOOK_TIMEOUT_MS
}

/** Pausa entre canales en fan-out global (default 1 min). */
function staggerMs(): number {
  return env.get('SYNC_WEBHOOK_GLOBAL_STAGGER_MS') ?? 60_000
}

function retryAfterMs(): number {
  return env.get('SYNC_WEBHOOK_RETRY_AFTER_MS') ?? DEFAULT_WEBHOOK_RETRY_AFTER_MS
}

/** Clave para x-api-key y firma: columna `webhook_secret` o env (API_KEY_BRANDS / alias). */
function brandsWebhookSecretFromEnv(): string | undefined {
  return (
    env.get('API_KEY_BRANDS')?.trim() ||
    env.get('X_API_KEY_BRANDS')?.trim() ||
    process.env['X-API-KEY-BRANDS']?.trim()
  )
}

function effectiveWebhookSecret(channel: Channel): string | undefined {
  return channel.webhookSecret?.trim() || brandsWebhookSecretFromEnv()
}

function buildPayload(
  event: SyncWebhookEvent,
  scope: 'global' | 'channel',
  countryCode: string,
  options: NotifyWebhookOptions & {
    channelId?: number | null
    channelName?: string | null
    staggerIndex?: number
    staggerTotal?: number
  }
): SyncWebhookPayload {
  const eventId = randomUUID()
  const meta: Record<string, unknown> = { ...(options.meta ?? {}) }
  if (options.staggerIndex !== undefined && options.staggerTotal !== undefined) {
    meta.stagger_index = options.staggerIndex
    meta.stagger_total = options.staggerTotal
  }

  return {
    event_id: eventId,
    event,
    scope,
    country_code: countryCode,
    occurred_at: new Date().toISOString(),
    success: options.success,
    ...(options.source ? { source: options.source } : {}),
    ...(options.message ? { message: options.message } : {}),
    ...(scope === 'channel' && options.channelId !== undefined
      ? { channel_id: options.channelId, channel_name: options.channelName ?? null }
      : {}),
    ...(Object.keys(meta).length > 0 ? { meta } : {}),
  }
}

function signBody(rawBody: string, secret: string | null | undefined): string | undefined {
  if (!secret || secret.trim() === '') return undefined
  const hex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  return `sha256=${hex}`
}

function httpsAllowedForWebhook(url: string): boolean {
  if (url.startsWith('https://')) return true
  if (env.get('NODE_ENV') !== 'production') return true
  logger.warn({ url: url.slice(0, 80) }, 'Webhook omitido: se requiere HTTPS en produccion')
  return false
}

async function postWebhookOnce(
  url: string,
  rawBody: string,
  signature: string | undefined,
  apiKey: string | undefined
): Promise<{ status: number }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'microservice-products-sync-webhook',
  }
  if (apiKey) {
    headers['x-api-key'] = apiKey
  }
  if (signature) {
    headers['X-Sync-Signature'] = signature
  }

  const res = await axios.post(url, rawBody, {
    headers,
    timeout: timeoutMs(),
    validateStatus: () => true,
  })

  return { status: res.status }
}

async function postWithRetries(
  url: string,
  rawBody: string,
  signature: string | undefined,
  apiKey: string | undefined,
  context: { event: SyncWebhookEvent; channelId?: number }
): Promise<void> {
  const maxAttempts = 3
  const pause = retryAfterMs()
  const delays = [0, pause, pause]

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (delays[attempt] > 0) {
      await sleep(delays[attempt])
    }
    try {
      const { status } = await postWebhookOnce(url, rawBody, signature, apiKey)
      if (status >= 200 && status < 300) {
        logger.info(
          { event: context.event, channelId: context.channelId, status, attempt: attempt + 1 },
          'Webhook entregado'
        )
        return
      }
      logger.warn(
        { event: context.event, channelId: context.channelId, status, attempt: attempt + 1 },
        'Webhook respuesta no OK, reintentando'
      )
    } catch (e: unknown) {
      const err = e as AxiosError
      logger.warn(
        {
          event: context.event,
          channelId: context.channelId,
          attempt: attempt + 1,
          message: err.message,
        },
        'Webhook error de red'
      )
    }
  }
  logger.error(
    { event: context.event, channelId: context.channelId },
    'Webhook fallo tras reintentos'
  )
}

export default class SyncWebhookNotifier {
  /**
   * Un canal concreto (sync por marca / productos por canal).
   */
  async notifyChannel(
    channelId: number,
    event: SyncWebhookEvent,
    options: NotifyWebhookOptions
  ): Promise<void> {
    if (!webhooksGloballyEnabled()) return

    const channel = await Channel.find(channelId)
    if (!channel) {
      logger.warn({ channelId }, 'Webhook canal: fila channels no encontrada')
      return
    }
    if (!channel.webhookEnabled) return

    const url = channel.webhookUrl?.trim() ?? null
    if (!url) {
      logger.warn(
        { channelId, name: channel.name },
        'Webhook canal: webhook_url vacio en BD (rellenar con sync de canales o manual)'
      )
      return
    }
    if (!httpsAllowedForWebhook(url)) return

    const secret = effectiveWebhookSecret(channel)
    if (!secret) {
      logger.warn(
        { channelId },
        'Webhook canal: sin webhook_secret en BD ni clave de marcas en env'
      )
      return
    }

    const countryCode = env.get('COUNTRY_CODE')
    const payload = buildPayload(event, 'channel', countryCode, {
      ...options,
      channelId: channel.id,
      channelName: channel.name,
    })
    const rawBody = JSON.stringify(payload)
    const signature = signBody(rawBody, secret)
    logger.info({ channelId, url: url.slice(0, 96) }, 'Webhook channel: inicio POST')
    await postWithRetries(url, rawBody, signature, secret, { event, channelId: channel.id })
  }

  /**
   * Todas las marcas del pais con webhook configurado (sync global).
   * Espacio de tiempo entre cada POST para no saturar destinos compartidos.
   */
  async notifyAllChannelsInCountry(
    event: SyncWebhookEvent,
    options: NotifyWebhookOptions
  ): Promise<void> {
    if (!webhooksGloballyEnabled()) return

    const countryCode = env.get('COUNTRY_CODE')
    const channels = await Channel.query()
      .where('country', countryCode)
      .where('webhook_enabled', true)
      .whereNotNull('webhook_url')
      .orderBy('id', 'asc')

    const withUrl = channels.filter((ch) => (ch.webhookUrl?.trim() ?? '').length > 0)
    const ready = withUrl.filter((ch) => effectiveWebhookSecret(ch))

    const total = ready.length
    if (total === 0) {
      logger.debug(
        { event, countryCode },
        withUrl.length > 0
          ? 'Webhook global: canales con webhook_url pero sin webhook_secret ni clave en env'
          : 'Webhook global: sin canales con webhook_url relleno y webhook_enabled para este pais'
      )
      return
    }

    const gap = staggerMs()
    logger.info({ event, total, staggerMs: gap }, 'Webhook global: inicio tanda')

    for (let i = 0; i < ready.length; i++) {
      const channel = ready[i]
      const url = channel.webhookUrl!.trim()
      const secret = effectiveWebhookSecret(channel)!
      if (!httpsAllowedForWebhook(url)) {
        if (i < ready.length - 1) {
          await sleep(gap)
        }
        continue
      }

      const payload = buildPayload(event, 'global', countryCode, {
        ...options,
        staggerIndex: i + 1,
        staggerTotal: total,
      })
      const rawBody = JSON.stringify(payload)
      const signature = signBody(rawBody, secret)
      logger.info(
        { event, channelId: channel.id, url: url.slice(0, 96) },
        'Webhook global: inicio POST'
      )
      await postWithRetries(url, rawBody, signature, secret, { event, channelId: channel.id })

      if (i < ready.length - 1) {
        await sleep(gap)
      }
    }

    logger.info({ event, total }, 'Webhook global: tanda finalizada')
  }
}
