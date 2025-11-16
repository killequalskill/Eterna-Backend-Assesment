// tests/redis-cache.test.ts
import redis from '../src/cache/redisClient'

describe('redis client basic', () => {

  // close redis connection after all tests in this file
  afterAll(async () => {
    try {
      await redis.quit()
    } catch (e) {
      // ignore shutdown errors
    }
  })

  test('set and get', async () => {
    await redis.set('test:key', 'value', 'EX', 5)
    const val = await redis.get('test:key')
    expect(val).toBe('value')
  })

  test('ttl expiry approximate', async () => {
    await redis.set('test:ttl', 'v', 'EX', 1)
    const v1 = await redis.get('test:ttl')
    expect(v1).toBe('v')

    // wait >1 second so Redis key expires
    await new Promise((resolve) => setTimeout(resolve, 1200))

    const v2 = await redis.get('test:ttl')
    expect(v2).toBeNull()
  })
})
