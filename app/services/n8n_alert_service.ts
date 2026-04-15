import { getN8nClient } from '#infrastructure/http/n8n_client'
import env from '#start/env'
import Logger from '@adonisjs/core/services/logger'
import type { AxiosError } from 'axios'

const REFERENCE_MAX_LENGTH = 600
const DETAILS_MAX_LENGTH = 4000

function detailsForN8n(message: unknown): string {
  if (message === undefined || message === null) {
    return ''
  }
  if (typeof message === 'string') {
    return message.length > DETAILS_MAX_LENGTH
      ? `${message.slice(0, DETAILS_MAX_LENGTH)}…`
      : message
  }
  try {
    const s = JSON.stringify(message)
    return s.length > DETAILS_MAX_LENGTH ? `${s.slice(0, DETAILS_MAX_LENGTH)}…` : s
  } catch {
    return String(message)
  }
}

/**
 * Envía alertas operativas a n8n (errores críticos de sync).
 * No relanza si n8n falla: el flujo de sync ya registró o propagará el error original.
 */
export default class N8nAlertService {
  private readonly logger = Logger.child({ service: 'N8nAlertService' })

  /**
   * @param title Lugar y tipo de error (ej. sync_productos:fatal)
   * @param reference Resumen breve del fallo
   * @param message Contexto extra (objeto serializable)
   */
  async send(title: string, reference: string, message: unknown): Promise<void> {
    const refTrim = reference?.trim() ?? ''
    const titleTrim = title?.trim() ?? ''
    if (!titleTrim || !refTrim) {
      this.logger.warn('Alerta n8n omitida: title y reference son obligatorios')
      return
    }

    const url = env.get('URL_N8N_NOTIFICATIONS')?.trim()
    if (!url) {
      this.logger.debug('URL_N8N_NOTIFICATIONS no configurada, alerta omitida')
      return
    }

    const user = env.get('API_N8N_USER')?.trim()
    const password = env.get('VALUE_API_N8N')?.trim()
    if (!user || !password) {
      this.logger.warn('Credenciales n8n ausentes, alerta omitida')
      return
    }

    const referenceTrunc =
      refTrim.length > REFERENCE_MAX_LENGTH ? `${refTrim.slice(0, REFERENCE_MAX_LENGTH)}…` : refTrim

    const payload = {
      title: titleTrim,
      reference: referenceTrunc,
      message,
      details: detailsForN8n(message),
    }

    try {
      const client = getN8nClient()
      await client.post(url, payload)
      this.logger.info({ title: titleTrim }, 'Alerta enviada a n8n')
    } catch (e: unknown) {
      const err = e as AxiosError
      this.logger.error(
        {
          title: titleTrim,
          message: err.message,
          status: err.response?.status,
          data: err.response?.data,
        },
        'Error enviando alerta a n8n'
      )
    }
  }
}
