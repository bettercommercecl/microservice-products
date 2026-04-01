import syncConfig from '#config/sync'
import Channel from '#models/channel'
import env from '#start/env'
import { channels as channelsConfig } from '#utils/channels/channels'
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

function timeoutMs(): number {
  return env.get('SYNC_WEBHOOK_TIMEOUT_MS') ?? 5000
}

function staggerMs(): number {
  return env.get('SYNC_WEBHOOK_GLOBAL_STAGGER_MS') ?? 90_000
}

const WEBHOOK_SYNC_PATH = syncConfig.webhookSyncProductsPath

/**
 * Base URL del webhook: mismo criterio que la sync por canal (`SyncController`):
 * `channels` en `utils/channels/channels` indexado por `name` del canal + `COUNTRY_CODE` del env.
 */
function resolveWebhookUrlFromConfig(channel: Channel): string | null {
  const name = channel.name
  if (!name?.trim()) return null

  const country = env.get('COUNTRY_CODE')
  const byBrand = channelsConfig as Record<string, Record<string, { API_URL?: string }>>
  const cfg = byBrand[name]?.[country]
  const apiUrl = cfg?.API_URL?.trim()
  if (!apiUrl) return null

  const base = apiUrl.replace(/\/$/, '')
  return `${base}${WEBHOOK_SYNC_PATH}`
}

/** Clave compartida para x-api-key y HMAC (env). Compatible con .env `X-API-KEY-BRANDS`. */
function brandsWebhookSecret(): string | undefined {
  return env.get('API_KEY_BRANDS')?.trim()
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
  const delays = [0, 500, 1500]

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

    const url = resolveWebhookUrlFromConfig(channel) ?? channel.webhookUrl?.trim() ?? null
    if (!url) {
      logger.warn(
        {
          channelId,
          name: channel.name,
          countryCode: env.get('COUNTRY_CODE'),
        },
        'Webhook: sin API_URL en channels.ts para name+COUNTRY_CODE ni webhook_url en BD'
      )
      return
    }
    if (!httpsAllowedForWebhook(url)) return

    const apiKey = brandsWebhookSecret()
    if (!apiKey) {
      logger.warn({ channelId }, 'Webhook omitido: define API_KEY_BRANDS en .env')
      return
    }

    const countryCode = env.get('COUNTRY_CODE')
    const payload = buildPayload(event, 'channel', countryCode, {
      ...options,
      channelId: channel.id,
      channelName: channel.name,
    })
    const rawBody = JSON.stringify(payload)
    const signingSecret = channel.webhookSecret?.trim() || apiKey
    const signature = signBody(rawBody, signingSecret)

    await postWithRetries(url, rawBody, signature, apiKey, { event, channelId: channel.id })
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

    const apiKey = brandsWebhookSecret()
    if (!apiKey) {
      logger.warn(
        { event },
        'Webhook global omitido: define API_KEY_BRANDS, X_API_KEY_BRANDS o X-API-KEY-BRANDS'
      )
      return
    }

    const countryCode = env.get('COUNTRY_CODE')
    const channels = await Channel.query()
      .where('country', countryCode)
      .where('webhook_enabled', true)
      .orderBy('id', 'asc')

    const withUrl = channels.filter((ch) => {
      const u = resolveWebhookUrlFromConfig(ch) ?? ch.webhookUrl?.trim() ?? ''
      return u.length > 0
    })

    const total = withUrl.length
    if (total === 0) {
      logger.debug(
        { event, countryCode },
        'Webhook global: sin canales con API_URL en config (o webhook_url en BD) para este pais'
      )
      return
    }

    const gap = staggerMs()
    logger.info({ event, total, staggerMs: gap }, 'Webhook global: inicio tanda')

    for (let i = 0; i < withUrl.length; i++) {
      const channel = withUrl[i]
      const url = resolveWebhookUrlFromConfig(channel) ?? channel.webhookUrl?.trim() ?? ''
      if (!url || !httpsAllowedForWebhook(url)) {
        continue
      }

      const payload = buildPayload(event, 'global', countryCode, {
        ...options,
        staggerIndex: i + 1,
        staggerTotal: total,
      })
      const rawBody = JSON.stringify(payload)
      const signingSecret = channel.webhookSecret?.trim() || apiKey
      const signature = signBody(rawBody, signingSecret)

      await postWithRetries(url, rawBody, signature, apiKey, { event, channelId: channel.id })

      if (i < withUrl.length - 1) {
        await sleep(gap)
      }
    }

    logger.info({ event, total }, 'Webhook global: tanda finalizada')
  }
}
