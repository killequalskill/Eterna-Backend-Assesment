// tests/aggregator.test.ts
jest.setTimeout(20000)

import nock from 'nock'
nock.disableNetConnect()

// Mock the actual src Redis client BEFORE importing the aggregator so the real client never connects.
// Provide __esModule: true so `import redis from '../src/cache/redisClient'` receives the mock default.
jest.mock('../src/cache/redisClient', () => {
  // in-memory storage (string) to simulate Redis key value
  let storedValue: string | null = null

  // default client shape — includes status and connect so aggregator's guards work
  const defaultClient: any = {
    // pretend to be connected by default in tests
    status: 'ready',
    set: jest.fn(async (_key: string, value: string) => {
      storedValue = value
      return Promise.resolve('OK')
    }),
    get: jest.fn(async (_key: string) => {
      return Promise.resolve(storedValue)
    }),
    // connect: mark ready (useful if aggregator tries to connect)
    connect: jest.fn(async () => {
      defaultClient.status = 'ready'
      return Promise.resolve()
    }),
    quit: jest.fn(async () => Promise.resolve()),
    disconnect: jest.fn(() => undefined),
  }

  // Helpful exported helpers (some modules may import these)
  const saveTokensToCache = jest.fn(async (tokens: any[]) => {
    storedValue = JSON.stringify(tokens)
    return Promise.resolve()
  })
  const readTokensFromCache = jest.fn(async () => {
    if (!storedValue) return []
    try {
      return JSON.parse(storedValue)
    } catch {
      return []
    }
  })

  return {
    __esModule: true,
    default: defaultClient,
    saveTokensToCache,
    readTokensFromCache,
  }
})

// Now import aggregator (it will use the mocked redis module)
import { aggregateOnce, saveTokensToCache, readTokensFromCache } from '../src/services/aggregator'
import redis from '../src/cache/redisClient'
import { TokenRecord } from '../src/types'

describe('aggregator integration (mocked APIs)', () => {
  beforeAll(() => {
    // mock dexscreener search endpoint
    nock('https://api.dexscreener.com')
      .get('/latest/dex/search')
      .query(true)
      .reply(200, {
        tokens: [
          { address: 'T1', name: 'Token1', symbol: 'TK1', priceUsd: 1, liquidity: 100, volume: 10, priceChange24h: 5 }
        ]
      })

    // mock jupiter search endpoint
    nock('https://lite-api.jup.ag')
      .get('/tokens/v2/search')
      .query(true)
      .reply(200, {
        data: [
          { address: 'T2', name: 'Token2', symbol: 'TK2', priceUsd: 2, liquidity: 50, volume: 5, change24h: 2 }
        ]
      })
  })

  afterAll(async () => {
    nock.cleanAll()
    nock.restore()

    try {
      if (redis && typeof (redis as any).quit === 'function') {
        await (redis as any).quit()
      }
    } catch (e) {
      // ignore
    }
    try {
      if (redis && typeof (redis as any).disconnect === 'function') {
        ;(redis as any).disconnect()
      }
    } catch (e) {
      // ignore
    }
  })

  test('aggregateOnce saves tokens to cache', async () => {
    const tokens = await aggregateOnce()
    expect(tokens.length).toBeGreaterThanOrEqual(1)

    const cached = await readTokensFromCache()
    expect(Array.isArray(cached)).toBe(true)
    expect(cached.length).toBeGreaterThanOrEqual(1)
    const found = cached.some((t) => t.token_address === 'T1' || t.token_address === 'T2')
    expect(found).toBeTruthy()
  })

  test('saveTokensToCache and read roundtrip', async () => {
    const sample: TokenRecord[] = [{ token_address: 'X', token_name: 'X', last_updated: Date.now() }]
    await saveTokensToCache(sample)
    const c = await readTokensFromCache()
    expect(Array.isArray(c)).toBe(true)
    expect(c[0].token_address).toBe('X')
  })
})
