import assert from 'node:assert'
import { app } from 'electron'
import type { CoachConfig } from '../../electron/app/config.ts'
import { LlmConfigStore } from '../../electron/coach/llm/LlmConfigStore.ts'

interface StoreHarnessOptions {
  encryptionAvailable?: boolean
  encryptedApiKey?: string
  encrypt?: (value: string) => Buffer
  decrypt?: (value: Buffer) => string
  save?: (partial: Partial<CoachConfig>) => void
}

function createHarness(options: StoreHarnessOptions = {}) {
  let config: CoachConfig = {
    enabled: true,
    sound: true,
    bubbleFrequency: 'medium',
    position: null,
    scale: 1,
    opacity: 1,
    pinMode: 'follow',
    llm: options.encryptedApiKey === undefined
      ? undefined
      : { encrypted_api_key: options.encryptedApiKey },
  }
  const saved: Array<Partial<CoachConfig>> = []

  const store = new LlmConfigStore({
    safeStorage: {
      isEncryptionAvailable: () => options.encryptionAvailable ?? true,
      encryptString: options.encrypt ?? ((value) => Buffer.from(`encrypted:${value}`)),
      decryptString: options.decrypt ?? ((value) => value.toString('utf8').replace(/^encrypted:/, '')),
    },
    loadCoachConfig: () => config,
    saveCoachConfig: (partial) => {
      options.save?.(partial)
      saved.push(partial)
      config = { ...config, ...partial }
    },
  })

  return { store, saved, getConfig: () => config }
}

async function runTests(): Promise<void> {
  await app.whenReady()

  const previousDemoKey = process.env.ARK_DEMO_KEY
  delete process.env.ARK_DEMO_KEY

  try {
  {
    const { store, saved } = createHarness({ encryptionAvailable: false })
    assert.strictEqual(store.saveApiKey('secret-key'), false)
    assert.deepStrictEqual(saved, [])
  }

  {
    const { store, saved } = createHarness({
      encrypt: () => { throw new Error('encryption failed') },
    })
    assert.strictEqual(store.saveApiKey('secret-key'), false)
    assert.deepStrictEqual(saved, [])
  }

  {
    const { store } = createHarness({
      save: () => { throw new Error('disk is read-only') },
    })
    assert.strictEqual(store.saveApiKey('secret-key'), false)
  }

  {
    const { store, getConfig } = createHarness()
    assert.strictEqual(store.saveApiKey('secret-key'), true)
    assert.strictEqual(
      getConfig().llm?.encrypted_api_key,
      Buffer.from('encrypted:secret-key').toString('base64'),
    )
  }

  {
    const { store, getConfig } = createHarness({ encryptedApiKey: 'plain:legacy-key' })
    assert.strictEqual(store.load().api_key, 'legacy-key')
    assert.strictEqual(
      getConfig().llm?.encrypted_api_key,
      Buffer.from('encrypted:legacy-key').toString('base64'),
    )
  }

  {
    const { store, getConfig } = createHarness({
      encryptionAvailable: false,
      encryptedApiKey: 'plain:legacy-key',
    })
    assert.strictEqual(store.load().api_key, '')
    assert.strictEqual(getConfig().llm?.encrypted_api_key, '')
  }

  {
    const { store } = createHarness({
      encryptedApiKey: 'plain:legacy-key',
      encrypt: () => { throw new Error('migration failed') },
      save: () => { throw new Error('cleanup failed') },
    })
    assert.strictEqual(store.load().api_key, '')
  }
  } finally {
    if (previousDemoKey === undefined) {
      delete process.env.ARK_DEMO_KEY
    } else {
      process.env.ARK_DEMO_KEY = previousDemoKey
    }
  }

  console.log('[PASS] LLM API keys require safe encrypted persistence and legacy plaintext is cleared')
}

runTests()
  .then(() => app.exit(0))
  .catch((error: unknown) => {
    console.error(error)
    app.exit(1)
  })
