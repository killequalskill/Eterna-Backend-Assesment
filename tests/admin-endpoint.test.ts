// tests/admin-endpoint.test.ts
jest.setTimeout(20000)

import nock from 'nock'
nock.disableNetConnect()


// 1. Mock redis BEFORE imports

jest.mock('../src/cache/redisClient', () => {
  let storedValue: string | null = null

  const defaultClient = {
    set: jest.fn(async (_k: string, v: string) => {
      storedValue = v
      return 'OK'
    }),
    get: jest.fn(async (_k: string) => storedValue),
    quit: jest.fn(async () => Promise.resolve()),
    disconnect: jest.fn(() => undefined),
  }

  const saveTokensToCache = jest.fn(async (tokens: any[]) => {
    storedValue = JSON.stringify(tokens)
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


// 2. Mock aggregator so endpoint behaves predictably

jest.mock('../src/services/aggregator', () => {
  let store: any[] = []

  return {
    __esModule: true,

    aggregateOnce: jest.fn(async () => {
      const tokens = [
        { token_address: 'ADM1', token_name: 'AdminToken', last_updated: Date.now() }
      ]
      store = tokens
      return tokens
    }),

    saveTokensToCache: jest.fn(async (tokens: any[]) => {
      store = tokens
    }),

    readTokensFromCache: jest.fn(async () => store.slice()),
  }
})


// 3. Now safe to import real app

import request from 'supertest'
import { createServer } from '../src/app'
import redis from '../src/cache/redisClient'
import { readTokensFromCache } from '../src/services/aggregator'

describe('admin aggregate endpoint', () => {
  let server: any

  beforeAll(() => {
    const { httpServer } = createServer()
    server = httpServer

    // allow localhost connections so supertest can call the test server
    nock.enableNetConnect('127.0.0.1')
  })

    afterAll(async () => {
    // 1) close the http server and wait for callback
    if (server && typeof server.close === 'function') {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    // 2) restore nock and allow normal network again
    try { nock.cleanAll() } catch {}
    try { nock.restore() } catch {}
    try { nock.enableNetConnect() } catch {}

    // 3) ensure mocked redis is shut down (mock provides quit/disconnect)
    try { await (redis as any).quit() } catch {}
    try { if ((redis as any).disconnect) (redis as any).disconnect() } catch {}

    // 4) give Node a tick to flush any remaining I/O callbacks
    await new Promise((r) => setImmediate(r))

    // 5) make sure timers are real (if any test used fake timers)
    try { jest.useRealTimers() } catch {}
  })

  test('POST /admin/aggregate triggers aggregation successfully', async () => {
    const res = await request(server).post('/admin/aggregate')

    expect(res.status).toBe(200)
    expect(res.body).toHaveProperty('ok', true)
    expect(typeof res.body.count).toBe('number')

    const cached = await readTokensFromCache()
    expect(Array.isArray(cached)).toBe(true)
  })
})
