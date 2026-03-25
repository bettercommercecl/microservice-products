import vine from '@vinejs/vine'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/**
 * Query para GET products/by-channel: channel_id (number) o brand (string).
 * Al menos uno debe venir; si vienen ambos, se usa channel_id.
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
