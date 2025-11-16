// tests/admin-endpoint.test.ts

import request from 'supertest'
import { createServer } from '../src/app'
import redis from '../src/cache/redisClient'
import { readTokensFromCache } from '../src/services/aggregator'

describe('admin aggregate endpoint', () => {
  let server: any

  beforeAll(() => {
    const { httpServer } = createServer()
    server = httpServer
  })

  afterAll(async () => {
    if (server && server.close) server.close()
    try { await redis.quit() } catch {}
    try { if (redis.disconnect) redis.disconnect() } catch {}
  })

  test('POST /admin/aggregate triggers aggregation successfully', async () => {
    const res = await request(server).post('/admin/aggregate')

    // Should return ok: true even if token count = 0 (depends on live API)
    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(res.body).toHaveProperty('count')

    // After calling admin, cache should be populated or remain empty but valid JSON
    const cached = await readTokensFromCache()
    expect(Array.isArray(cached)).toBe(true)
  })
})
