import type { DataChangedPayload } from '@shared/types/data'

export function subscribeDataChanged(handler: (payload: DataChangedPayload) => void): () => void {
  return window.api.data.onChanged(handler)
}
