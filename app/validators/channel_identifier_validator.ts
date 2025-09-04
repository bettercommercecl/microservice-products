import vine from '@vinejs/vine'

/**
 * 🎯 Validador para identificador de canal
 * Acepta tanto channel_id (número) como nombre de canal (MARCA)
 * Ejemplos válidos: 1, 1420393, "UF", "fc", "Af"
 */
export const channelIdentifierValidator = vine.compile(
  vine.object({
    channel_id: vine
      .string()
      .trim()
      .transform((value: string) => {
        // 🔍 Verificar si es un número (channel_id)
        if (/^\d+$/.test(value)) {
          const numericValue = Number.parseInt(value, 10)
          if (numericValue <= 0) {
            throw new Error('El channel_id debe ser un número positivo mayor a 0')
          }
          return {
            type: 'id' as const,
            value: numericValue,
            original: value,
          }
        }

        // 🔍 Verificar si es un nombre de canal (MARCA)
        const upperValue = value.toUpperCase()
        const pattern = /^[A-Z]{2,3}$/

        if (pattern.test(upperValue)) {
          return {
            type: 'name' as const,
            value: upperValue,
            original: value,
          }
        }

        // 🚨 Formato inválido
        throw new Error(
          'El identificador debe ser un channel_id numérico (ej: 1, 1420393) o un nombre de canal con formato MARCA (ej: UF, FC, AF)'
        )
      }),
  })
)
