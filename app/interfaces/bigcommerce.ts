export interface BigCommerceBrand {
  id: number
  title: string
  page_title?: string
  description?: string
  is_visible?: boolean
}

export interface SyncResult {
  total: number
  created: number
  updated: number
  failed: number
  errors: Array<{ id: number; error: string }>
  duration: number
} 