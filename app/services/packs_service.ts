import env from '#start/env'
import { ChannelConfigInterface } from '#interfaces/channel_interface'
import Logger from '@adonisjs/core/services/logger'
import axios from 'axios'
import Variant from '#models/variant'

interface PacksResponseInterface {
  pack_simple: PackItemInput[]
  pack_variants: PackItemInput[]
}
interface PackItemInput {
  table_id: number
  pack_id: number
  product_id: number
  sku: string
  stock: number
  quantity: number
  is_variant: boolean
  variant_id: number
  serial: string | null
  reserve: string | null
}
export default class PacksService {
  private readonly logger = Logger.child({ service: 'PacksService' })
  private readonly channelConfig: ChannelConfigInterface

  constructor(channelDataConfig: ChannelConfigInterface) {
    this.channelConfig = channelDataConfig
    this.logger.info('PacksService initialized')
  }

  async getPacks(): Promise<PacksResponseInterface> {
    try {
      this.logger.debug(
        {
          endpoint: `${this.channelConfig.API_URL}/api/packs`,
        },
        'PacksService - solicitando packs al canal externo'
      )
      const response = await axios.get(`${this.channelConfig.API_URL}/api/packs`, {
        headers: {
          'x-api-key': env.get('X_API_KEY'),
        },
      })
      return response.data
    } catch (error) {
      this.logger.error({ error }, 'Error getting packs')
      throw error
    }
  }
  async saveDataPackSimple(packSimple: PackItemInput[]): Promise<void> {
    try {
      const packsById = packSimple.reduce<Record<number, PackItemInput[]>>((acc, item) => {
        if (typeof item.pack_id !== 'number') {
          return acc
        }
        if (!acc[item.pack_id]) {
          acc[item.pack_id] = []
        }
        acc[item.pack_id].push(item)
        return acc
      }, {})

      const packIds = Object.keys(packsById).map(Number)

      if (packIds.length === 0) {
        this.logger.warn('PacksService - no hay pack_id válidos en packs simples')
        return
      }

      const depletedPackIds = packIds.filter((packId) =>
        this.hasDepletedComponents(packsById[packId])
      )

      if (depletedPackIds.length === 0) {
        this.logger.info('PacksService - no se encontraron packs simples con componentes agotados')
        return
      }

      const variants = await Variant.query()
        .whereIn('product_id', depletedPackIds)
        .select(['id', 'product_id'])

      const variantIdsByPack = variants.reduce<Record<number, number[]>>((acc, variant) => {
        if (!acc[variant.product_id]) {
          acc[variant.product_id] = []
        }
        acc[variant.product_id].push(variant.id)
        return acc
      }, {})

      const missingPackIds = depletedPackIds.filter(
        (packId) => !variantIdsByPack[packId] || variantIdsByPack[packId].length === 0
      )
      if (missingPackIds.length > 0) {
        this.logger.warn(
          {
            packIds: missingPackIds,
          },
          'PacksService - no se encontró variante asociada para algunos packs simples'
        )
      }

      const updates: Array<{ id: number; stock: number }> = []
      const affectedPacks: Record<number, number[]> = {}

      depletedPackIds.forEach((packId) => {
        const variantIds = variantIdsByPack[packId] || []
        if (variantIds.length === 0) {
          return
        }
        affectedPacks[packId] = variantIds
        variantIds.forEach((variantId) => {
          updates.push({ id: variantId, stock: 0 })
        })
      })

      if (updates.length === 0) {
        this.logger.info('PacksService - no se encontraron packs simples con variantes mapeadas')
        return
      }

      await Variant.updateOrCreateMany('id', updates)
      this.logger.info(
        {
          total: updates.length,
          packs: affectedPacks,
        },
        'PacksService - packs simples deshabilitados por falta de stock en componentes'
      )
    } catch (error) {
      this.logger.error({ error }, 'Error al guardar los packs simples')
      throw error
    }
  }
  private hasDepletedComponents(packItems: PackItemInput[]): boolean {
    return packItems.some((item) => {
      const available = Number(item.stock ?? 0)
      const required = Number(item.quantity ?? 0)

      if (required <= 0) {
        return available <= 0
      }

      return available < required
    })
  }
  async saveDataPackVariants(packVariants: PackItemInput[]): Promise<void> {
    try {
      const packsById = packVariants.reduce<Record<string, PackItemInput[]>>((acc, item) => {
        const packId = Number(item.pack_id)
        const variantId = Number(item.variant_id)

        if (!Number.isFinite(packId) || !Number.isFinite(variantId)) {
          return acc
        }

        const key = `${packId}:${variantId}`
        if (!acc[key]) {
          acc[key] = []
        }
        acc[key].push(item)
        return acc
      }, {})

      const packVariantKeys = Object.keys(packsById)
      if (packVariantKeys.length === 0) {
        this.logger.warn(
          'PacksService - no hay combinaciones pack_id + variant_id válidas en packs de variantes'
        )
        return
      }

      const combosToDisable = packVariantKeys
        .filter((key) => this.hasDepletedComponents(packsById[key]))
        .map((key) => {
          const [packId, variantId] = key.split(':').map(Number)
          return { packId, variantId }
        })
        .filter(({ variantId }) => Number.isFinite(variantId))

      if (combosToDisable.length === 0) {
        this.logger.info(
          'PacksService - no se encontraron packs de variantes con componentes agotados'
        )
        return
      }

      const variantIds = combosToDisable.map(({ variantId }) => variantId)

      const variants = await Variant.query().whereIn('id', variantIds).select(['id'])
      const existingVariants = new Set(variants.map((variant) => variant.id))

      const missingVariantIds = variantIds.filter((variantId) => !existingVariants.has(variantId))
      if (missingVariantIds.length > 0) {
        this.logger.warn(
          {
            variantIds: missingVariantIds,
          },
          'PacksService - no se encontró variante asociada para algunas combinaciones pack + variante'
        )
      }

      const updates: Array<{ id: number; stock: number }> = []
      const affectedCombos: Array<{ packId: number; variantIds: number[] }> = []

      combosToDisable.forEach(({ packId, variantId }) => {
        if (!existingVariants.has(variantId)) {
          return
        }

        const combo = affectedCombos.find((item) => item.packId === packId)
        if (combo) {
          combo.variantIds.push(variantId)
        } else {
          affectedCombos.push({ packId, variantIds: [variantId] })
        }

        updates.push({ id: variantId, stock: 0 })
      })

      if (updates.length === 0) {
        this.logger.info(
          'PacksService - no se encontraron packs de variantes con variantes mapeadas'
        )
        return
      }

      await Variant.updateOrCreateMany('id', updates)
      this.logger.info(
        {
          total: updates.length,
          packs: affectedCombos,
        },
        'PacksService - packs de variantes deshabilitados por falta de stock en componentes'
      )
    } catch (error) {
      this.logger.error({ error }, 'Error al guardar los packs variantes')
      throw error
    }
  }
  async syncPacks(): Promise<void> {
    try {
      const packs = await this.getPacks()
      if (packs.pack_simple.length > 0) {
        await this.saveDataPackSimple(packs.pack_simple)
      }
      if (packs.pack_variants.length > 0) {
        await this.saveDataPackVariants(packs.pack_variants)
      }
      this.logger.info('PacksService - packs sincronizados exitosamente')
    } catch (error) {
      this.logger.error({ error }, 'Error al sincronizar los packs')
      throw new Error('Error al sincronizar los packs')
    }
  }
}
