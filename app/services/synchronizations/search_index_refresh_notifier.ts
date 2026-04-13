import Channel from '#models/channel'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import axios, { type AxiosError } from 'axios'

const logger = Logger.child({ service: 'SearchIndexRefreshNotifier' })

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Si no esta definida en env, se asume true (solo se desactiva con false explicito). */
function searchIndexRefreshGloballyEnabled(): boolean {
  return env.get('SEARCH_INDEX_REFRESH_ENABLED') !== false
}

function staggerMs(): number {
  return env.get('SYNC_WEBHOOK_GLOBAL_STAGGER_MS') ?? 60_000
}

function timeoutMs(): number {
  return env.get('SEARCH_INDEX_REFRESH_TIMEOUT_MS') ?? 60_000
}

function httpsAllowed(url: string): boolean {
  if (url.startsWith('https://')) return true
  if (env.get('NODE_ENV') !== 'production') return true
  logger.warn(
    { url: url.slice(0, 80) },
    'Search index refresh omitido: se requiere HTTPS en produccion'
  )
  return false
}

async function getOnce(url: string): Promise<{ status: number }> {
  const res = await axios.get(url, {
    timeout: timeoutMs(),
    validateStatus: () => true,
    headers: {
      'User-Agent': 'microservice-products-search-index-refresh',
    },
  })
  return { status: res.status }
}

async function getWithRetries(url: string, context: { channelId?: number }): Promise<void> {
  const maxAttempts = 2
  const pauseMs = 5_000

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(pauseMs)
    }
    try {
      const { status } = await getOnce(url)
      if (status >= 200 && status < 300) {
        logger.info(
          { channelId: context.channelId, status, attempt: attempt + 1 },
          'Search index refresh GET entregado'
        )
        return
      }
      logger.warn(
        { channelId: context.channelId, status, attempt: attempt + 1 },
        'Search index refresh respuesta no OK'
      )
    } catch (e: unknown) {
      const err = e as AxiosError
      logger.warn(
        {
          channelId: context.channelId,
          attempt: attempt + 1,
          message: err.message,
        },
        'Search index refresh error de red'
      )
    }
  }
  logger.error({ channelId: context.channelId }, 'Search index refresh fallo tras reintentos')
}

/**
 * Dispara GET a search_index_refresh_url del canal (sin auth). No bloquea al llamador.
 */
export default class SearchIndexRefreshNotifier {
  scheduleRefreshChannel(channelId: number): void {
    void this.runRefreshChannel(channelId).catch((err) =>
      logger.error({ err, channelId }, 'Search index refresh canal: error no capturado')
    )
  }

  /**
   * Un GET por canal con URL configurada, mismo escalonado que webhooks globales.
   */
  scheduleRefreshAllInBackground(): void {
    void this.runRefreshAll().catch((err) =>
      logger.error({ err }, 'Search index refresh global: error no capturado')
    )
  }

  private async runRefreshChannel(channelId: number): Promise<void> {
    if (!searchIndexRefreshGloballyEnabled()) return

    const channel = await Channel.find(channelId)
    if (!channel) {
      logger.warn({ channelId }, 'Search index refresh: canal no encontrado')
      return
    }
    if (!channel.searchIndexRefreshEnabled) return

    const url = channel.searchIndexRefreshUrl?.trim() ?? ''
    if (!url) return
    if (!httpsAllowed(url)) return

    logger.info({ channelId, url: url.slice(0, 96) }, 'Search index refresh canal: inicio GET')
    await getWithRetries(url, { channelId: channel.id })
  }

  private async runRefreshAll(): Promise<void> {
    if (!searchIndexRefreshGloballyEnabled()) return

    const countryCode = env.get('COUNTRY_CODE')
    const channels = await Channel.query()
      .where('country', countryCode)
      .where('search_index_refresh_enabled', true)
      .whereNotNull('search_index_refresh_url')
      .orderBy('id', 'asc')

    const ready = channels.filter((ch) => (ch.searchIndexRefreshUrl?.trim() ?? '').length > 0)
    if (ready.length === 0) {
      logger.debug({ countryCode }, 'Search index refresh global: sin canales con URL configurada')
      return
    }

    const gap = staggerMs()
    logger.info(
      { total: ready.length, staggerMs: gap },
      'Search index refresh global: inicio tanda GET'
    )

    for (let i = 0; i < ready.length; i++) {
      const channel = ready[i]
      const url = channel.searchIndexRefreshUrl!.trim()
      if (!httpsAllowed(url)) {
        if (i < ready.length - 1) {
          await sleep(gap)
        }
        continue
      }

      logger.info(
        { channelId: channel.id, url: url.slice(0, 96) },
        'Search index refresh global: inicio GET'
      )
      await getWithRetries(url, { channelId: channel.id })

      if (i < ready.length - 1) {
        await sleep(gap)
      }
    }

    logger.info({ total: ready.length }, 'Search index refresh global: tanda finalizada')
  }
}
