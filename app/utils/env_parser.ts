import env from '#start/env'

export function parseEnvInt(key: string): number | null {
  const val = env.get(key)
  if (val === undefined || val === null || val === '') return null
  const parsed = Number.parseInt(String(val), 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function parseEnvFloat(key: string): number | null {
  const val = env.get(key)
  if (val === undefined || val === null || val === '') return null
  const parsed = Number.parseFloat(String(val))
  return Number.isNaN(parsed) ? null : parsed
}

export function createBatches<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size))
  }
  return batches
}
