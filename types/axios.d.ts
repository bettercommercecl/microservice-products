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

  export interface AxiosRequestConfig {
    headers?: Record<string, string>
    timeout?: number
    params?: Record<string, string | number | undefined>
  }

  export interface AxiosInstance {
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>
    put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>
    patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>
    delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>
  }

  const axios: AxiosInstance
  export default axios
}
