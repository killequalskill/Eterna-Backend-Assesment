// tests/aggregator.test.ts
import nock from 'nock'
import { aggregateOnce, saveTokensToCache, readTokensFromCache } from '../src/services/aggregator'
import redis from '../src/cache/redisClient'
import { TokenRecord } from '../src/types'

// integration-like tests for aggregator using mocked external APIs (nock)
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
    // remove all nock interceptors
    nock.cleanAll()
    nock.restore()

    // gracefully close redis client used by the tests to avoid open handles
    try {
      await redis.quit()
    } catch (e) {
      // ignore errors on shutdown
    }
    try {
      // ensure socket/connection cleared
      if (typeof redis.disconnect === 'function') redis.disconnect()
    } catch (e) {
      // ignore
    }
  })

  test('aggregateOnce saves tokens to cache', async () => {
    const tokens = await aggregateOnce()
    expect(tokens.length).toBeGreaterThanOrEqual(1)

    const cached = await readTokensFromCache()
    expect(cached.length).toBeGreaterThanOrEqual(1)
    const found = cached.some((t) => t.token_address === 'T1' || t.token_address === 'T2')
    expect(found).toBeTruthy()
  })

  test('saveTokensToCache and read roundtrip', async () => {
    const sample: TokenRecord[] = [{ token_address: 'X', token_name: 'X', last_updated: Date.now() }]
    await saveTokensToCache(sample)
    const c = await readTokensFromCache()
    expect(c[0].token_address).toBe('X')
  })
})
