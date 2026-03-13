/**
 * Declaracion del modulo axios para que TypeScript resuelva tipos
 * cuando node_modules no se resuelve (IDE/entorno).
 */
declare module 'axios' {
  export interface AxiosResponse<T = unknown> {
    data: T
    status: number
    statusText: string
    headers: unknown
    config: unknown
  }

  export interface AxiosError {
    message: string
    response?: { status?: number; statusText?: string; data?: unknown }
    config?: { url?: string; method?: string }
  }

  export interface AxiosInstance {
    get<T = unknown>(url: string, config?: unknown): Promise<AxiosResponse<T>>
    put<T = unknown>(url: string, data?: unknown, config?: unknown): Promise<AxiosResponse<T>>
    delete<T = unknown>(url: string, config?: unknown): Promise<AxiosResponse<T>>
  }
}
