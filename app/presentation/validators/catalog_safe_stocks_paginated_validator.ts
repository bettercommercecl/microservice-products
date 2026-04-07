import { paginationConfig } from '#config/pagination'
import vine from '@vinejs/vine'

const DEFAULT_PAGE = paginationConfig.defaultPage
const DEFAULT_LIMIT = 1000
const MAX_LIMIT = paginationConfig.maxLimit

export const catalogSafeStocksPaginatedSchema = vine.object({
  page: vine
    .number()
    .optional()
    .transform((value: unknown) => {
      if (value === undefined || value === null || value === '') return DEFAULT_PAGE
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
      if (value === undefined || value === null || value === '') return DEFAULT_LIMIT
      const numValue = Number(value)
      if (Number.isNaN(numValue) || numValue <= 0) {
        throw new Error('El límite debe ser un número positivo mayor a 0')
      }
      return numValue > MAX_LIMIT ? MAX_LIMIT : numValue
    }),
})
