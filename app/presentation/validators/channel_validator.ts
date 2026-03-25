import vine from '@vinejs/vine'

export const createChannelValidator = vine.compile(
  vine.object({
    id: vine.number().positive(),
    name: vine.string().trim().minLength(1).maxLength(255),
    tree_id: vine.number().optional().nullable(),
    parent_category: vine.number().optional().nullable(),
  })
)

export const updateChannelValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(255).optional(),
    tree_id: vine.number().optional().nullable(),
    parent_category: vine.number().optional().nullable(),
    country: vine.string().trim().maxLength(10).optional().nullable(),
  })
)
