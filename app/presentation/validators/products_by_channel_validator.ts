import { paginationConfig } from '#config/pagination'
import vine from '@vinejs/vine'

const DEFAULT_PAGE = paginationConfig.defaultPage
const DEFAULT_LIMIT = paginationConfig.defaultLimit
const MAX_LIMIT = paginationConfig.maxLimit

/**
 * Query para GET products/by-channel: channel_id (number) y/o brand (string).
 * Al menos uno obligatorio.
 * Canal efectivo: si viene channel_id se usa ese id; si no, canal por nombre (brand) ignorando mayúsculas/minúsculas.
 * Si vienen ambos, channel_id tiene prioridad; brand no altera la consulta (cliente puede enviarlo igual que en otros entornos).
 */
export const productsByChannelSchema = vine.object({
  channel_id: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return undefined
      }
      const numValue = Number(value)
      if (Number.isNaN(numValue) || numValue <= 0) {
        throw new Error('channel_id debe ser un número positivo')
      }
      return numValue
    }),

  brand: vine
    .string()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null) {
        return undefined
      }
      const str = String(value).trim()
      return str === '' ? undefined : str
    }),

  page: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return DEFAULT_PAGE
      }
      const numValue = Number(value)
      if (Number.isNaN(numValue) || numValue <= 0) return DEFAULT_PAGE
      return numValue
    }),

  limit: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return DEFAULT_LIMIT
      }
      const numValue = Number(value)
      if (Number.isNaN(numValue) || numValue <= 0) return DEFAULT_LIMIT
      return numValue > MAX_LIMIT ? MAX_LIMIT : numValue
    }),
})
