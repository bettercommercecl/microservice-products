import vine from '@vinejs/vine'

// Esquema de validación para obtener producto por ID
export const productShowSchema = vine.object({
  id: vine
    .number()
    .positive()
    .transform((value) => Number(value)),
})

// Tipo TypeScript para el esquema validado
export type ProductShowSchema = typeof productShowSchema
