import vine from '@vinejs/vine'

const DEFAULT_PAGE = 1

export const reviewsPaginatedSchema = vine.object({
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
})

