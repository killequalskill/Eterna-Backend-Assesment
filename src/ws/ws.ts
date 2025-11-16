// src/ws/ws.ts
import { Server as IOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { readTokensFromCache } from '../services/aggregator'
import { TokenRecord } from '../types'
import debug from 'debug'

const log = debug('app:ws')

// thresholds for emitting updates
const PRICE_CHANGE_PERCENT_THRESHOLD = 0.5 // percent
const VOLUME_SPIKE_FACTOR = 2 // multiplier

type RoomKey = string

// build a stable room key from subscription options
function roomKey(options: { limit?: number; sortBy?: string; period?: string }) {
  const limit = options.limit ?? 20
  const sortBy = options.sortBy ?? 'volume'
  const period = options.period ?? '24h'
  return `${sortBy}:${period}:limit=${limit}`
}

// helper: percent change check
function priceChangedEnough(oldPrice?: number, newPrice?: number) {
  if (oldPrice == null || newPrice == null) return true
  if (oldPrice === 0) return true
  const diff = Math.abs((newPrice - oldPrice) / oldPrice) * 100
  return diff >= PRICE_CHANGE_PERCENT_THRESHOLD
}

// helper: volume spike check
function volumeSpikedEnough(oldVol?: number, newVol?: number) {
  if (oldVol == null || newVol == null) return true
  if (oldVol === 0) return newVol > 0
  return newVol >= oldVol * VOLUME_SPIKE_FACTOR
}

// minimal update payload
function tokenDeltaPayload(t: TokenRecord) {
  return {
    token_address: t.token_address,
    token_name: t.token_name,
    token_ticker: t.token_ticker,
    price_sol: t.price_sol,
    volume_sol: t.volume_sol,
    market_cap_sol: t.market_cap_sol,
    liquidity_sol: t.liquidity_sol,
    price_change: (t as any).price_change ?? null,
    last_updated: t.last_updated
  }
}

// watch loop control
let stopLoop = false
let watchIntervalMs = 3000 // default 3s between checks

// stop the background watch loop (use in tests/teardown)
export function stopWatchLoop() {
  stopLoop = true
}

// start websocket server and background watcher
export function startWebsocket(httpServer: HTTPServer) {
  const io = new IOServer(httpServer, { cors: { origin: '*' } })

  // per-room last-seen state
  const roomState = new Map<RoomKey, Map<string, { price?: number; volume?: number; last_updated?: number }>>()

  io.on('connection', (socket) => {
    log('client connected', socket.id)

    socket.on('subscribe', async (payload: { limit?: number; sortBy?: string; period?: string } = {}) => {
      const rk = roomKey(payload)
      socket.join(rk)
      if (!roomState.has(rk)) roomState.set(rk, new Map())

      // send snapshot (try/catch to avoid crash if redis temporarily unavailable)
      try {
        const tokens = await readTokensFromCache()
        const page = tokens.slice(0, payload.limit ?? 20)
        socket.emit('snapshot', page)

        // populate room state from snapshot
        const state = roomState.get(rk)!
        for (const t of page) {
          state.set(t.token_address, { price: t.price_sol, volume: t.volume_sol, last_updated: t.last_updated })
        }
      } catch (e) {
        socket.emit('snapshot', [])
      }
    })

    socket.on('unsubscribe', (payload: { limit?: number; sortBy?: string; period?: string } = {}) => {
      const rk = roomKey(payload)
      socket.leave(rk)
    })

    socket.on('disconnect', () => {
      log('client disconnected', socket.id)
    })

    socket.on('ping', () => socket.emit('pong'))
  })

  // background watch loop: compute diffs per room and emit token_updates
  async function watchLoop() {
    try {
      if (stopLoop) return

      const tokens = await readTokensFromCache()
      if (!tokens || tokens.length === 0) {
        // no data; schedule next iteration
        if (!stopLoop) setTimeout(watchLoop, Math.max(1000, Math.min(watchIntervalMs, 5000)))
        return
      }

      for (const [rk, state] of roomState.entries()) {
        const updates: any[] = []

        for (const t of tokens) {
          const prev = state.get(t.token_address)
          const priceChanged = priceChangedEnough(prev?.price, t.price_sol)
          const volumeSpiked = volumeSpikedEnough(prev?.volume, t.volume_sol)
          const isNewer = !prev?.last_updated || (t.last_updated && t.last_updated > prev.last_updated)

          if ((priceChanged || volumeSpiked) && isNewer) {
            updates.push(tokenDeltaPayload(t))
            state.set(t.token_address, { price: t.price_sol, volume: t.volume_sol, last_updated: t.last_updated })
          }
        }

        if (updates.length) {
          io.to(rk).emit('token_updates', updates)
        }
      }
    } catch (e) {
      // log but do not crash
      // eslint-disable-next-line no-console
      console.error('ws watchLoop error', e)
    } finally {
      if (!stopLoop) setTimeout(watchLoop, watchIntervalMs)
    }
  }

  // start the loop (non-blocking)
  stopLoop = false
  setImmediate(() => watchLoop())

  return io
}
