import assert from 'node:assert'
import { test } from 'vitest'
import {
  ArkClient,
  type ArkChatCompletionRequest,
  type ArkClientFactory,
  type ArkClientFactoryOptions,
} from '../../electron/coach/llm/ArkClient.ts'
import type { LlmConfig } from '../../electron/coach/llm/LlmHintTypes.ts'

const config: LlmConfig = {
  api_key: 'test-key-never-sent',
  base_url: 'https://ark.test.invalid/api/v3',
  model: 'test-model',
  enabled: true,
}

const messages = [
  { role: 'system' as const, content: 'Return a useful hint.' },
  { role: 'user' as const, content: 'I am stuck.' },
]

interface MockState {
  factoryOptions: ArkClientFactoryOptions[]
  requests: ArkChatCompletionRequest[]
}

function createMockClient(
  handler: (request: ArkChatCompletionRequest) => Promise<{
    choices: Array<{ message?: { content?: string | null } }>
    model?: string
    usage?: { prompt_tokens?: number; completion_tokens?: number } | null
  }>,
): { client: ArkClient; state: MockState } {
  const state: MockState = { factoryOptions: [], requests: [] }
  const factory: ArkClientFactory = (options) => {
    state.factoryOptions.push(options)
    return {
      async createCompletion(request) {
        state.requests.push(request)
        return handler(request)
      },
    }
  }
  return { client: new ArkClient(factory), state }
}

test('returns and normalizes a structured reply', async () => {
  const { client, state } = createMockClient(async () => ({
    choices: [{ message: { content: JSON.stringify({
      message: 'Check the smallest boundary first.',
      hint_type: 'boundary',
    }) } }],
    model: 'ark-structured',
  }))
  client.init(config)

  const result = await client.chat(messages, { target_level: 2 })

  assert.strictEqual(result.response.message, 'Check the smallest boundary first.')
  assert.deepStrictEqual(result.response.related_tags, [])
  assert.strictEqual(result.response.confidence, 0.5)
  assert.strictEqual(result.response.reveals_solution, false)
  assert.strictEqual(result.model, 'ark-structured')
  assert.deepStrictEqual(state.requests[0]?.response_format, { type: 'json_object' })
  assert.deepStrictEqual(state.requests[0]?.thinking, { type: 'disabled' })
})

test('returns free chat text without requesting JSON mode', async () => {
  const { client, state } = createMockClient(async () => ({
    choices: [{ message: { content: 'Try writing down the invariant.' } }],
  }))
  client.init(config)

  const result = await client.chatText(messages, {
    target_level: 1,
    disable_thinking: false,
  })

  assert.strictEqual(result.content, 'Try writing down the invariant.')
  assert.strictEqual(state.requests[0]?.response_format, undefined)
  assert.strictEqual(state.requests[0]?.thinking, undefined)
})

test('reports prompt and completion token usage', async () => {
  const { client } = createMockClient(async () => ({
    choices: [{ message: { content: JSON.stringify({
      message: 'Inspect the transition.',
      hint_type: 'strategy',
      related_tags: ['dp'],
      confidence: 0.8,
      reveals_solution: false,
    }) } }],
    usage: { prompt_tokens: 123, completion_tokens: 45 },
  }))
  client.init(config)

  const result = await client.chat(messages, { target_level: 3 })

  assert.strictEqual(result.tokens_input, 123)
  assert.strictEqual(result.tokens_output, 45)
})

test('rejects an empty reply so the caller can fall back locally', async () => {
  const { client } = createMockClient(async () => ({
    choices: [{ message: { content: '' } }],
  }))
  client.init(config)

  await assert.rejects(
    () => client.chatText(messages, { target_level: 1 }),
    /LLM returned empty content/,
  )
})

test('rejects invalid structured JSON without exposing more than the response prefix', async () => {
  const invalid = `not-json-${'x'.repeat(300)}`
  const { client } = createMockClient(async () => ({
    choices: [{ message: { content: invalid } }],
  }))
  client.init(config)

  await assert.rejects(async () => {
    await client.chat(messages, { target_level: 2 })
  }, (error: unknown) => {
    assert(error instanceof Error)
    assert.match(error.message, /^LLM returned invalid JSON:/)
    assert(error.message.length < invalid.length)
    return true
  })
})

test('returns a connection failure without issuing a real network request', async () => {
  const { client, state } = createMockClient(async () => {
    throw new Error('connection refused')
  })

  const result = await client.testConnection(config)

  assert.strictEqual(result.success, false)
  assert.match(result.message, /connection refused/)
  assert.strictEqual(state.factoryOptions[0]?.maxRetries, 0)
  assert.strictEqual(state.factoryOptions[0]?.timeout, 10000)
})

test('reports SDK timeouts as a failed connection test', async () => {
  const { client } = createMockClient(async () => {
    const error = new Error('Request timed out after 10000ms')
    error.name = 'APIConnectionTimeoutError'
    throw error
  })

  const result = await client.testConnection(config)

  assert.strictEqual(result.success, false)
  assert.match(result.message, /timed out after 10000ms/)
})
