import vine from '@vinejs/vine'
import env from '#start/env'
import { channels } from '#utils/channels/channels'

// 🌍 Obtener el country code del environment
const countryCode = env.get('COUNTRY_CODE') as 'CL' | 'CO' | 'PE'

// 🏷️ Obtener los channel_ids válidos según el país
const getValidChannelIds = (country: 'CL' | 'CO' | 'PE'): number[] => {
  const validIds: number[] = []

  // 🔍 Iterar sobre todas las marcas en channels.ts
  Object.values(channels).forEach((brand) => {
    const countryConfig = brand[country as keyof typeof brand] as any
    if (countryConfig?.CHANNEL) {
      validIds.push(countryConfig.CHANNEL)
    }
  })

  return validIds.sort((a, b) => a - b)
}

const validChannelIds = getValidChannelIds(countryCode)

// 📋 Esquema de validación para variantes paginadas
export const variantsPaginatedSchema = vine.object({
  page: vine.number().transform((value: any) => {
    const numValue = Number(value)
    if (Number.isNaN(numValue) || numValue <= 0) {
      throw new Error('📄 La página debe ser un número positivo mayor a 0')
    }
    return numValue
  }),

  limit: vine.number().transform((value: any) => {
    const numValue = Number(value)
    if (Number.isNaN(numValue) || numValue <= 0) {
      throw new Error('📊 El límite debe ser un número positivo mayor a 0')
    }
    return numValue
  }),

  channel: vine
    .number()
    .optional()
    .transform((value: any) => {
      if (value === undefined || value === null) {
        return undefined
      }

      const numValue = Number(value)
      if (Number.isNaN(numValue) || numValue <= 0) {
        throw new Error('🏪 El channel ID debe ser un número positivo')
      }

      if (!validChannelIds.includes(numValue)) {
        throw new Error(
          `🚫 El channel ID debe ser uno de los siguientes valores válidos para ${countryCode}: ${validChannelIds.join(', ')}`
        )
      }

      return numValue
    }),
})

// 🔍 Tipo TypeScript para el esquema validado
export type VariantsPaginatedSchema = typeof variantsPaginatedSchema
