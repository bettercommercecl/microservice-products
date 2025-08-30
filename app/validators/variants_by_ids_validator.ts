import vine from '@vinejs/vine'

// 📋 Esquema de validación para variantes por IDs
export const variantsByIdsSchema = vine.object({
  ids: vine.array(vine.number().positive()).minLength(1).maxLength(100),
})

// 🔍 Tipo TypeScript para el esquema validado
export type VariantsByIdsSchema = typeof variantsByIdsSchema
