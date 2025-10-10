import vine from '@vinejs/vine'
import { PARENT } from '#utils/channels/brands'

// Obtener los channel_ids válidos de las marcas
const validChannelIds = Object.keys(PARENT)
  .map(Number)
  .sort((a, b) => a - b)

// Esquema de validación para sincronización de productos
export const productsSyncSchema = vine.object({
  channel_id: vine
    .number()
    .positive()
    .in(validChannelIds)
    .transform((value) => Number(value)),
})

// Tipo TypeScript para el esquema validado
export type ProductsSyncSchema = typeof productsSyncSchema
