// tests/ws-snapshot.test.ts
jest.setTimeout(20000)


// Mock redis BEFORE importing server

jest.mock('../src/cache/redisClient', () => {
  let storedValue: string | null = null

  const defaultClient = {
    set: jest.fn(async (_k: string, v: string) => {
      storedValue = v
      return Promise.resolve('OK')
    }),
    get: jest.fn(async (_k: string) => Promise.resolve(storedValue)),
    quit: jest.fn(async () => {
      storedValue = null
      return Promise.resolve()
    }),
    disconnect: jest.fn(() => {
      storedValue = null
    }),
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


// Mock aggregator helpers so we can pre-load cache

jest.mock('../src/services/aggregator', () => {
  let store: any[] = []
  return {
    __esModule: true,
    saveTokensToCache: jest.fn(async (tokens: any[]) => {
      store = tokens.slice()
      return Promise.resolve()
    }),
    readTokensFromCache: jest.fn(async () => store.slice()),
  }
})


// Now import app and socket client

import { createServer } from '../src/app'
import redis from '../src/cache/redisClient'
import { saveTokensToCache } from '../src/services/aggregator'
import { TokenRecord } from '../src/types'
import { io as Client } from 'socket.io-client'

describe('websocket snapshot behavior', () => {
  let server: any
  let httpServerAddress: string

  const fakeTokens: TokenRecord[] = [
    {
      token_address: 'WS1',
      token_name: 'WS Token',
      token_ticker: 'WST',
      price_sol: 1.5,
      market_cap_sol: 150,
      volume_sol: 300,
      liquidity_sol: 30,
      transaction_count: 20,
      last_updated: Date.now(),
      price_1hr_change: 2,
      price_24hr_change: 5,
      price_7d_change: 12
    }
  ]

  beforeAll(async () => {
    const { httpServer } = createServer()
    server = httpServer

    // start server on ephemeral port and wait for it to be listening
    await new Promise<void>((resolve, reject) => {
      try {
        server.listen(0, () => resolve())
      } catch (e) {
        reject(e)
      }
    })

    const addressInfo: any = server.address()
    httpServerAddress = `http://localhost:${addressInfo.port}`

    // preload mocked cache via mocked aggregator.saveTokensToCache
    await saveTokensToCache(fakeTokens)
  })

  afterAll(async () => {
    // close http server and wait
    if (server && typeof server.close === 'function') {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    // shutdown mocked redis
    try { await (redis as any).quit() } catch {}
    try { if ((redis as any).disconnect) (redis as any).disconnect() } catch {}

    // give Node an extra tick to flush any callbacks
    await new Promise((r) => setImmediate(r))
  })

  test('subscribe event returns a snapshot', async () => {
    // Promise that resolves when snapshot received or rejects on timeout/error
    const result = await new Promise<any>((resolve, reject) => {
      const socket = Client(httpServerAddress, {
        transports: ['websocket'],
        forceNew: true,
        reconnection: false,
      })

      const timeout = setTimeout(() => {
        socket.close()
        reject(new Error('timeout waiting for snapshot'))
      }, 5000)

      socket.on('connect', () => {
        socket.emit('subscribe', { limit: 10, sortBy: 'volume' })
      })

      socket.on('snapshot', (data: any) => {
        clearTimeout(timeout)
        socket.close()
        resolve(data)
      })

      socket.on('connect_error', (err: any) => {
        clearTimeout(timeout)
        socket.close()
        reject(err)
      })

      // safety: handle unexpected close
      socket.on('close', () => {
        // if no result yet, the timeout will handle it
      })
    })

    // assertions
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(1)
    expect(result[0].token_address).toBe('WS1')
  })
})
