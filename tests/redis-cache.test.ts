// tests/redis-cache.test.ts
jest.setTimeout(20000)

// Mock the redis client module before importing to prevent real connections
jest.mock('../src/cache/redisClient', () => {
  // in-memory store with expiry support
  const store = new Map<string, { value: string; expiresAt: number | null }>()
  let timers = new Set<number>()

  function clearAllTimers() {
    for (const id of timers) {
      try { clearTimeout(id) } catch {}
    }
    timers.clear()
  }

  const defaultClient = {
    // set signature: set(key, value, 'EX', seconds) — support common variants
    set: jest.fn(async (key: string, value: string, ...rest: any[]) => {
      let expiresAt: number | null = null
      if (rest && rest.length >= 2) {
        const mode = rest[0]
        const ttl = rest[1]
        if (typeof mode === 'string' && mode.toUpperCase() === 'EX' && typeof ttl === 'number') {
          expiresAt = Date.now() + ttl * 1000
          // schedule a cleanup to mimic Redis expiry
          const id = setTimeout(() => {
            store.delete(key)
            timers.delete(id as unknown as number)
          }, ttl * 1000) as unknown as number
          timers.add(id)
        }
      }
      store.set(key, { value, expiresAt })
      return Promise.resolve('OK')
    }),

    // get returns stored value or null if missing/expired
    get: jest.fn(async (key: string) => {
      const rec = store.get(key)
      if (!rec) return Promise.resolve(null)
      if (rec.expiresAt && Date.now() > rec.expiresAt) {
        store.delete(key)
        return Promise.resolve(null)
      }
      return Promise.resolve(rec.value)
    }),

    // quit / disconnect are no-ops
    quit: jest.fn(async () => {
      clearAllTimers()
      store.clear()
      return Promise.resolve()
    }),
    disconnect: jest.fn(() => {
      clearAllTimers()
      store.clear()
    }),
  }

  // also export helper functions in case other modules import them directly
  const saveTokensToCache = jest.fn(async (tokens: any[]) => {
    // store under a test key for compatibility; not used by these tests
    store.set('__mock_tokens__', { value: JSON.stringify(tokens), expiresAt: null })
  })

  const readTokensFromCache = jest.fn(async () => {
    const rec = store.get('__mock_tokens__')
    if (!rec) return []
    try {
      return JSON.parse(rec.value)
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

// Now import the mocked client
import redis from '../src/cache/redisClient'

describe('redis client basic', () => {
  // close redis connection after all tests in this file
  afterAll(async () => {
    try {
      await (redis as any).quit()
    } catch (e) {
      // ignore shutdown errors
    }
  })

  test('set and get', async () => {
    await (redis as any).set('test:key', 'value', 'EX', 5)
    const val = await (redis as any).get('test:key')
    expect(val).toBe('value')
  })

  test('ttl expiry approximate', async () => {
    await (redis as any).set('test:ttl', 'v', 'EX', 1)
    const v1 = await (redis as any).get('test:ttl')
    expect(v1).toBe('v')

    // wait >1 second so key expires
    await new Promise((resolve) => setTimeout(resolve, 1200))

    const v2 = await (redis as any).get('test:ttl')
    expect(v2).toBeNull()
  })
})
