import vine from '@vinejs/vine'
import { PARENT } from '../constants/brands.js'

// 🏷️ Obtener los channel_ids válidos de las marcas
const validChannelIds = Object.keys(PARENT)
  .map(Number)
  .sort((a, b) => a - b)

// 📋 Esquema de validación para variantes paginadas
export const variantsPaginatedSchema = vine.object({
  page: vine
    .number()
    .positive()
    .transform((value: any) => Number(value)),

  limit: vine
    .number()
    .positive()
    .transform((value: any) => Number(value)),

  channel_id: vine
    .number()
    .positive()
    .in(validChannelIds)
    .optional()
    .transform((value: any) => (value ? Number(value) : undefined)),
})

// 🔍 Tipo TypeScript para el esquema validado
export type VariantsPaginatedSchema = typeof variantsPaginatedSchema
