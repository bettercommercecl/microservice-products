import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios'
import Logger from '@adonisjs/core/services/logger'
import env from '#start/env'

type AxiosRequestConfigWithRetry = AxiosRequestConfig & { _retryCount?: number }

export default class BigcommerceRateLimitInterceptor {
  private requestsLeft: number = 450
  private timeWindowMs: number = 30000
  private timeResetMs: number = 0
  private quota: number = 450
  private lastRequestTime: number = 0
  private minDelayBetweenRequests: number = 67

  private readonly CRITICAL_THRESHOLD = 10
  private readonly LOW_THRESHOLD = 50
  private readonly MAX_RETRIES = 3

  private static instance: BigcommerceRateLimitInterceptor | null = null

  public static getInstance(): BigcommerceRateLimitInterceptor {
    if (!BigcommerceRateLimitInterceptor.instance) {
      BigcommerceRateLimitInterceptor.instance = new BigcommerceRateLimitInterceptor()
    }
    return BigcommerceRateLimitInterceptor.instance
  }

  public setup(): void {
    axios.interceptors.request.use(
      async (config: any) => {
        if (this.isBigcommerceRequest(config)) {
          await this.handlePreRequest(config)
        }
        return config
      },
      (error) => Promise.reject(error)
    )

    axios.interceptors.response.use(
      (response: AxiosResponse) => {
        if (this.isBigcommerceRequest(response.config)) {
          this.handleSuccessResponse(response)
        }
        return response
      },
      async (error: AxiosError) => {
        if (error.config && this.isBigcommerceRequest(error.config)) {
          return await this.handleErrorResponse(error)
        }
        return Promise.reject(error)
      }
    )

    Logger.info('✅ BigCommerce Rate Limit Interceptor configurado')
  }

  private isBigcommerceRequest(config: AxiosRequestConfig): boolean {
    const url = config.url || ''
    const baseURL = config.baseURL || ''
    const fullUrl = (baseURL + url).toLowerCase()
    const bigcommerceUrl = env.get('BIGCOMMERCE_API_URL', '').toLowerCase()

    return (
      fullUrl.includes('api.bigcommerce.com') ||
      (!!bigcommerceUrl && fullUrl.includes(bigcommerceUrl))
    )
  }

  private async handlePreRequest(_config: AxiosRequestConfig): Promise<void> {
    const now = Date.now()

    if (this.requestsLeft <= this.CRITICAL_THRESHOLD) {
      const waitTime = this.timeResetMs + 100
      Logger.warn(
        `⚠️ Rate limit crítico (${this.requestsLeft}/${this.quota} restantes). Esperando ${waitTime}ms hasta reset...`
      )
      await this.sleep(waitTime)
      this.requestsLeft = this.quota
      this.timeResetMs = 0
    }

    if (this.requestsLeft <= this.LOW_THRESHOLD && this.requestsLeft > this.CRITICAL_THRESHOLD) {
      const adjustedDelay = this.minDelayBetweenRequests * 2
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < adjustedDelay) {
        const waitTime = adjustedDelay - timeSinceLastRequest
        await this.sleep(waitTime)
      }
    } else {
      const timeSinceLastRequest = now - this.lastRequestTime
      if (timeSinceLastRequest < this.minDelayBetweenRequests) {
        const waitTime = this.minDelayBetweenRequests - timeSinceLastRequest
        await this.sleep(waitTime)
      }
    }

    this.lastRequestTime = Date.now()
  }

  private handleSuccessResponse(response: AxiosResponse): void {
    const headers = response.headers || {}

    const requestsLeftHeader = this.getHeaderValue(headers, 'x-rate-limit-requests-left')
    const timeResetMsHeader = this.getHeaderValue(headers, 'x-rate-limit-time-reset-ms')
    const quotaHeader = this.getHeaderValue(headers, 'x-rate-limit-requests-quota')
    const timeWindowMsHeader = this.getHeaderValue(headers, 'x-rate-limit-time-window-ms')

    const requestsLeft = this.parseIntHeader(requestsLeftHeader, this.requestsLeft)
    const timeResetMs = this.parseIntHeader(timeResetMsHeader, this.timeResetMs)
    const quota = this.parseIntHeader(quotaHeader, this.quota)
    const timeWindowMs = this.parseIntHeader(timeWindowMsHeader, this.timeWindowMs)

    this.requestsLeft = requestsLeft
    this.timeResetMs = timeResetMs
    this.quota = quota
    this.timeWindowMs = timeWindowMs

    const calculatedMinDelay = quota > 0 ? Math.ceil(timeWindowMs / quota) : 67

    if (requestsLeft < 50) {
      this.minDelayBetweenRequests = calculatedMinDelay * 2
    } else if (requestsLeft < 200) {
      this.minDelayBetweenRequests = Math.ceil(calculatedMinDelay * 1.5)
    } else {
      this.minDelayBetweenRequests = calculatedMinDelay
    }

    if (requestsLeft < this.LOW_THRESHOLD) {
      Logger.warn(`⚠️ Rate limit bajo: ${requestsLeft}/${quota} requests restantes`)
    } else if (requestsLeft % 50 === 0) {
      Logger.info(`📊 Rate limit status: ${requestsLeft}/${quota} requests restantes`)
    }
  }

  private async handleErrorResponse(error: AxiosError): Promise<any> {
    const status = error.response?.status
    const config = error.config as AxiosRequestConfigWithRetry

    if (status === 429) {
      const headers = error.response?.headers || {}
      const timeResetMsHeader = this.getHeaderValue(headers, 'x-rate-limit-time-reset-ms')
      const timeResetMs = this.parseIntHeader(timeResetMsHeader, 30000)

      config._retryCount = (config._retryCount || 0) + 1

      if (config._retryCount <= this.MAX_RETRIES) {
        Logger.warn(
          `🔄 Rate limit excedido (429). Reintento ${config._retryCount}/${this.MAX_RETRIES} después de ${timeResetMs}ms`
        )
        await this.sleep(timeResetMs + 500)
        this.requestsLeft = this.quota
        this.timeResetMs = 0

        return axios.request(config)
      } else {
        Logger.error(`❌ Rate limit excedido después de ${this.MAX_RETRIES} reintentos`)
        throw new Error(`Rate limit excedido después de ${this.MAX_RETRIES} intentos`)
      }
    }

    return Promise.reject(error)
  }

  private getHeaderValue(headers: any, key: string): string | string[] | null {
    const lowerKey = key.toLowerCase()
    const upperKey = key
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('-')

    const value = headers[lowerKey] || headers[upperKey] || headers[key] || null

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value)
    }

    return value
  }

  private parseIntHeader(
    value: string | string[] | undefined | null,
    defaultValue: number
  ): number {
    if (!value) return defaultValue

    const str = Array.isArray(value) ? value[0] : value
    const parsed = Number.parseInt(str, 10)

    return Number.isNaN(parsed) ? defaultValue : parsed
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  public getStatus(): {
    requestsLeft: number
    quota: number
    timeResetMs: number
    timeWindowMs: number
    minDelayBetweenRequests: number
  } {
    return {
      requestsLeft: this.requestsLeft,
      quota: this.quota,
      timeResetMs: this.timeResetMs,
      timeWindowMs: this.timeWindowMs,
      minDelayBetweenRequests: this.minDelayBetweenRequests,
    }
  }
}
