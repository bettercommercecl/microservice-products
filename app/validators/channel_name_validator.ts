import vine from '@vinejs/vine'

/**
 * 🎯 Validador personalizado para nombres de canal
 * Valida que el nombre tenga la estructura: MARCA_PAIS (ej: UF_CL, FC_CL)
 * Acepta tanto mayúsculas como minúsculas
 */
export const channelNameValidator = vine.compile(
  vine.object({
    name: vine
      .string()
      .trim()
      .transform((value: string) => {
        // Convertir a mayúsculas
        const upperValue = value.toUpperCase()

        // Validar estructura MARCA_PAIS
        const pattern = /^[A-Z]{2}_[A-Z]{2}$/
        if (!pattern.test(upperValue)) {
          throw new Error(
            'El nombre del canal debe tener la estructura MARCA_PAIS (ej: UF_CL, FC_CL)'
          )
        }

        return upperValue
      }),
  })
)
