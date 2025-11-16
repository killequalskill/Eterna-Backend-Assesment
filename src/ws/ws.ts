// src/ws/ws.ts
import { Server as IOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { readTokensFromCache } from '../services/aggregator'
import { TokenRecord } from '../types'
import debug from 'debug'

const log = debug('app:ws')

// start socket.io server; attaches to existing HTTP server
export function startWebsocket(httpServer: HTTPServer) {
  const io = new IOServer(httpServer, {
    cors: {
      origin: '*'
    }
  })

  // emit full tokens snapshot to a client when they request subscription
  io.on('connection', (socket) => {
    log('client connected', socket.id)

    socket.on('subscribe', async (payload: { limit?: number; cursor?: string; sortBy?: string; period?: string }) => {
      // client expects initial dataset via REST — but allow fallback
      try {
        const tokens = await readTokensFromCache()
        // send a small page snapshot
        const page = tokens.slice(0, payload?.limit ?? 20)
        socket.emit('snapshot', page)
      } catch (e) {
        socket.emit('error', 'failed to fetch snapshot')
      }
    })

    // lightweight ping/pong
    socket.on('ping', () => socket.emit('pong'))
  })

  // background: watch redis key and push diffs on change
  // For simplicity in this repo we use polling to detect changes and broadcast
  let lastSnapshot: Record<string, number> = {}

  async function watchLoop() {
    try {
      const tokens = await readTokensFromCache()
      const map: Record<string, TokenRecord> = {}
      for (const t of tokens) map[t.token_address] = t

      // detect changes: price changes or volume spikes
      const updates: TokenRecord[] = []
      for (const addr of Object.keys(map)) {
        const t = map[addr]
        const prevTs = lastSnapshot[addr]
        // simple change detection by comparing last_updated and price
        if (!prevTs || (t.last_updated && t.last_updated > prevTs)) {
          // push update
          updates.push(t)
          lastSnapshot[addr] = t.last_updated ?? Date.now()
        }
      }
      if (updates.length) {
        // broadcast updates to all connected clients; in real-world you'd scope rooms
        io.emit('token_updates', updates)
      }
    } catch (e) {
      // swallow & log
      // eslint-disable-next-line no-console
      console.error('ws watchLoop error', e)
    } finally {
      setTimeout(watchLoop, 1000 * 5) // check every 5s
    }
  }

  watchLoop()

  return io
}
