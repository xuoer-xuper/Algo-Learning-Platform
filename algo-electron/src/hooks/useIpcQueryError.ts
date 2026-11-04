import { useEffect } from 'react'
import { reportRendererError } from '../rendererErrors'

export function useIpcQueryError(error: Error | null, scope: string): void {
  useEffect(() => {
    if (error) reportRendererError(scope, error)
  }, [error, scope])
}
