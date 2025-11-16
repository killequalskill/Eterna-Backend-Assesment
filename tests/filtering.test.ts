// tests/filtering.test.ts

import { saveTokensToCache } from '../src/services/aggregator'
import { TokenRecord } from '../src/types'
import request from 'supertest'
import { createServer } from '../src/app'
import redis from '../src/cache/redisClient'

// purpose: verify filtering (period map) and minPriceChange behavior
describe('filtering and period correctness', () => {
  let server: any

  const fakeTokens: TokenRecord[] = [
    {
      token_address: 'A',
      token_name: 'Alpha',
      token_ticker: 'A',
      price_sol: 1,
      market_cap_sol: 100,
      volume_sol: 500,
      liquidity_sol: 50,
      transaction_count: 100,
      last_updated: Date.now(),
      price_1hr_change: 10,
      price_24hr_change: 20,
      price_7d_change: 30
    },
    {
      token_address: 'B',
      token_name: 'Beta',
      token_ticker: 'B',
      price_sol: 2,
      market_cap_sol: 200,
      volume_sol: 600,
      liquidity_sol: 60,
      transaction_count: 200,
      last_updated: Date.now(),
      price_1hr_change: -5,
      price_24hr_change: -10,
      price_7d_change: -20
    }
  ]

  beforeAll(async () => {
    const { httpServer } = createServer()
    server = httpServer
    await saveTokensToCache(fakeTokens)
  })

  afterAll(async () => {
    try {
      await redis.quit()
    } catch {}
    try {
      if (typeof redis.disconnect === 'function') redis.disconnect()
    } catch {}
    if (server && server.close) server.close()
  })

  test('period=1h maps price_change to price_1hr_change', async () => {
    const res = await request(server)
      .get('/tokens?period=1h&sortBy=price_change&limit=10')

    expect(res.status).toBe(200)
    const items = res.body.items
    expect(items.length).toBe(2)

    // extracted price_change values should be 10 and -5
    const changes = items.map((t: any) => t.price_change)
    expect(changes).toContain(10)
    expect(changes).toContain(-5)
  })

  test('minPriceChange filters tokens by absolute percent movement', async () => {
    // period=24h => use price_24hr_change => values: 20, -10
    // minPriceChange=15 => only token A (20 >= 15)
    const res = await request(server)
      .get('/tokens?period=24h&minPriceChange=15&limit=10')

    expect(res.status).toBe(200)
    const items = res.body.items

    expect(items.length).toBe(1)
    expect(items[0].token_address).toBe('A')
  })
})
