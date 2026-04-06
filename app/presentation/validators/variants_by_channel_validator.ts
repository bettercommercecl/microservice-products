import vine from '@vinejs/vine'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
/** Sync masivo por canal: permite paginas grandes; el servidor acota memoria/timeout */
const MAX_LIMIT = 10_000

/** Query para GET /variants/by-channel: channel_id (number) o brand (string). */
export const variantsByChannelSchema = vine.object({
  channel_id: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') return undefined
      const num = Number(value)
      if (Number.isNaN(num) || num <= 0) throw new Error('channel_id debe ser un número positivo')
      return num
    }),

  brand: vine
    .string()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null) return undefined
      const str = String(value).trim()
      return str === '' ? undefined : str
    }),

  page: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') return DEFAULT_PAGE
      const num = Number(value)
      if (Number.isNaN(num) || num <= 0) return DEFAULT_PAGE
      return num
    }),

  limit: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') return DEFAULT_LIMIT
      const num = Number(value)
      if (Number.isNaN(num) || num <= 0) return DEFAULT_LIMIT
      return num > MAX_LIMIT ? MAX_LIMIT : num
    }),
})
