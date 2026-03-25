import vine from '@vinejs/vine'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

/** Query para GET /variants/paginated (solo page y limit). */
export const variantsPaginatedListSchema = vine.object({
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
