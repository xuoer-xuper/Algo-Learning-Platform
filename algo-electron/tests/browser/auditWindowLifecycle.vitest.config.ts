import { mergeConfig } from 'vitest/config'
import base from '../../vitest.config'

export default mergeConfig(base, {
  test: {
    include: ['tests/browser/auditWindowLifecycle.repro.ts'],
    fileParallelism: false,
    maxWorkers: 1,
    coverage: { enabled: false },
  },
})
