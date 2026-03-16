import vine from '@vinejs/vine'

const DEFAULT_PAGE = 1
const DEFAULT_LIMIT = 50
const MAX_LIMIT = 200

export const productsPaginatedSchema = vine.object({
  page: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return DEFAULT_PAGE
      }
      const numValue = Number(value)
      if (Number.isNaN(numValue) || numValue <= 0) {
        throw new Error('La página debe ser un número positivo mayor a 0')
      }
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
      if (Number.isNaN(numValue) || numValue <= 0) {
        throw new Error('El límite debe ser un número positivo mayor a 0')
      }
      if (numValue > MAX_LIMIT) {
        return MAX_LIMIT
      }
      return numValue
    }),
})
