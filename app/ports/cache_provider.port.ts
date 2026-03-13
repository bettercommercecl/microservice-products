/**
 * Puerto de cache (Hexagonal).
 * La capa de aplicacion depende de esta abstraccion; la implementacion (Redis, in-memory, etc.) se inyecta.
 */
export interface CacheProvider {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
  invalidateByPrefix(prefix: string): Promise<void>
}
