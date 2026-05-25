import vine from '@vinejs/vine'

export const catalogSafeStocksBySkusSchema = vine.compile(
  vine.object({
    skus: vine.array(vine.string().trim().minLength(1)).minLength(1).maxLength(500),
  })
)
