// tests/ws-snapshot.test.ts

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

    server.listen(0) // let OS pick a free port
    const addressInfo: any = server.address()
    httpServerAddress = `http://localhost:${addressInfo.port}`

    await saveTokensToCache(fakeTokens)
  })

  afterAll(async () => {
    if (server && server.close) server.close()
    try { await redis.quit() } catch {}
    try { if (redis.disconnect) redis.disconnect() } catch {}
  })

  test('subscribe event returns a snapshot', (done) => {
    const socket = Client(httpServerAddress, {
      transports: ['websocket']
    })

    socket.on('connect', () => {
      socket.emit('subscribe', { limit: 10, sortBy: 'volume' })
    })

    socket.on('snapshot', (data) => {
      try {
        expect(Array.isArray(data)).toBe(true)
        expect(data.length).toBe(1)
        expect(data[0].token_address).toBe('WS1')
        socket.close()
        done()
      } catch (err) {
        socket.close()
        done(err)
      }
    })

    socket.on('connect_error', (err: any) => {
      socket.close()
      done(err)
    })
  })
})
