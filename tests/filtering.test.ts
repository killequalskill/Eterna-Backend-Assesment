// tests/filtering.test.ts
jest.setTimeout(20000)

import nock from 'nock'
nock.disableNetConnect()

// ------------------------------
// Mock redis BEFORE importing server
// ------------------------------
jest.mock('../src/cache/redisClient', () => {
    let storedValue: string | null = null
    const timers = new Set<number>()

    const clearAll = () => {
        for (const t of timers) {
            try { clearTimeout(t) } catch { }
        }
        timers.clear()
        storedValue = null
    }

    const defaultClient = {
        // support set(key, value, 'EX', seconds)
        set: jest.fn(async (_k: string, v: string, ...rest: any[]) => {
            // handle optional EX ttl but we won't schedule expiry for these tests
            storedValue = v
            return Promise.resolve('OK')
        }),
        get: jest.fn(async (_k: string) => Promise.resolve(storedValue)),
        quit: jest.fn(async () => {
            clearAll()
            return Promise.resolve()
        }),
        disconnect: jest.fn(() => clearAll()),
    }

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

// ------------------------------
// Mock aggregator helpers (so saveTokensToCache/readTokensFromCache are deterministic)
// ------------------------------
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

// ------------------------------
// Now safe to import the real app and test libs
// ------------------------------
import request from 'supertest'
import { createServer } from '../src/app'
import redis from '../src/cache/redisClient'
import { saveTokensToCache } from '../src/services/aggregator'
import { TokenRecord } from '../src/types'

describe('filtering and period correctness', () => {
    let server: any
    let baseUrl: string

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

        // start server on ephemeral port and wait for it to be listening
        await new Promise<void>((resolve, reject) => {
            try {
                server.listen(0, () => resolve())
            } catch (err) {
                reject(err)
            }
        })

        const addr: any = server.address()
        baseUrl = `http://localhost:${addr.port}`

        // allow localhost, 127.0.0.1, or ::1 (with optional port)
        try {
            nock.enableNetConnect((host: string) => {
                return /^(localhost|127\.0\.0\.1|::1)(:\d+)?$/.test(host)
            })
        } catch { }


        // preload mocked cache via mocked aggregator.saveTokensToCache
        await saveTokensToCache(fakeTokens)
    })

    afterAll(async () => {
        // close server and wait
        if (server && typeof server.close === 'function') {
            await new Promise<void>((resolve) => server.close(() => resolve()))
        }

        // shutdown mocked redis
        try { await (redis as any).quit() } catch { }
        try { if ((redis as any).disconnect) (redis as any).disconnect() } catch { }

        // restore nock to default
        try { nock.cleanAll() } catch { }
        try { nock.restore() } catch { }
        try { nock.enableNetConnect() } catch { }

        // extra tick to flush
        await new Promise((r) => setImmediate(r))
    })

    test('period=1h maps price_change to price_1hr_change', async () => {
        const res = await request(baseUrl)
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
        const res = await request(baseUrl)
            .get('/tokens?period=24h&minPriceChange=15&limit=10')

        expect(res.status).toBe(200)
        const items = res.body.items

        expect(items.length).toBe(1)
        expect(items[0].token_address).toBe('A')
    })
})
