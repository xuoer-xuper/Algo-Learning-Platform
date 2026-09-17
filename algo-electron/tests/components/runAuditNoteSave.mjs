import { startVitest } from 'vitest/node'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const file = 'tests/components/auditNoteSave.repro.tsx'
const context = await startVitest('test', [file], {
  root, include: [file], watch: false, maxWorkers: 1,
  testTimeout: 15_000,
})
if (!context) throw new Error('Audit Vitest context did not start')
await context.close()
