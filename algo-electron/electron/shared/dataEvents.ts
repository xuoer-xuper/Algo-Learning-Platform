import { EventEmitter } from 'node:events'
import type { DataChangedPayload, DataTable } from '../../src/shared/types/data'
import { logger } from './logger'

const events = new EventEmitter<{ changed: [DataChangedPayload] }>()
const transactionChanges: Set<DataTable>[] = []

export function emitDataChanged(tables: readonly DataTable[]): void {
  const current = transactionChanges.at(-1)
  if (current) {
    for (const table of tables) current.add(table)
    return
  }
  if (tables.length > 0) events.emit('changed', { tables: [...new Set(tables)] })
}

export function subscribeDataChanges(listener: (payload: DataChangedPayload) => void): () => void {
  const guarded = (payload: DataChangedPayload): void => {
    try {
      listener(payload)
    } catch {
      // A subscriber must not turn an already committed write into a failed mutation.
      logger.warn('data-events.listener-failed')
    }
  }
  events.on('changed', guarded)
  return () => {
    events.off('changed', guarded)
  }
}

/** Wrap the synchronous transaction invocation, so even a failed commit discards its changes. */
export function withDataChangeTransaction<T>(operation: () => T): T {
  const changes = new Set<DataTable>()
  transactionChanges.push(changes)
  let result: T
  try {
    result = operation()
  } catch (error) {
    transactionChanges.pop()
    throw error
  }
  transactionChanges.pop()
  emitDataChanged([...changes])
  return result
}
