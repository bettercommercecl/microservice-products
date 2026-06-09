import vine from '@vinejs/vine'

export const metaCatalogBrandParamSchema = vine.compile(
  vine.object({
    brand: vine
      .string()
      .trim()
      .minLength(2)
      .maxLength(10)
      .transform((value) => value.toUpperCase()),
  })
)
