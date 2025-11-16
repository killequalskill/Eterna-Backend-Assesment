// src/ws/ws.ts
import { Server as IOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { readTokensFromCache } from '../services/aggregator'
import { TokenRecord } from '../types'
import debug from 'debug'
import { CACHE_TTL_SECONDS } from '../config'

const log = debug('app:ws')

// thresholds for emitting updates
const PRICE_CHANGE_PERCENT_THRESHOLD = 0.5 // percent change threshold (0.5%)
const VOLUME_SPIKE_FACTOR = 2 // if volume increases > 2x, emit

type RoomKey = string

// build a stable room key from subscription options
function roomKey(options: { limit?: number; sortBy?: string; period?: string }) {
  const limit = options.limit ?? 20
  const sortBy = options.sortBy ?? 'volume'
  const period = options.period ?? '24h'
  return `${sortBy}:${period}:limit=${limit}`
}

// helper to decide if price changed enough (percent)
function priceChangedEnough(oldPrice?: number, newPrice?: number) {
  if (oldPrice == null || newPrice == null) return true
  if (oldPrice === 0) return true
  const diff = Math.abs((newPrice - oldPrice) / oldPrice) * 100
  return diff >= PRICE_CHANGE_PERCENT_THRESHOLD
}

// helper to decide if volume spike
function volumeSpikedEnough(oldVol?: number, newVol?: number) {
  if (oldVol == null || newVol == null) return true
  if (oldVol === 0) return newVol > 0
  return newVol >= oldVol * VOLUME_SPIKE_FACTOR
}

// token minimal payload for updates
function tokenDeltaPayload(t: TokenRecord) {
  return {
    token_address: t.token_address,
    token_name: t.token_name,
    token_ticker: t.token_ticker,
    price_sol: t.price_sol,
    volume_sol: t.volume_sol,
    market_cap_sol: t.market_cap_sol,
    liquidity_sol: t.liquidity_sol,
    last_updated: t.last_updated
  }
}

// start websocket server and manage subscriptions + delta pushes
export function startWebsocket(httpServer: HTTPServer) {
  const io = new IOServer(httpServer, {
    cors: { origin: '*' }
  })

  // last seen snapshots per room: roomKey -> Map<token_address, { price: number | undefined, volume: number | undefined, last_updated }>
  const roomState = new Map<RoomKey, Map<string, { price?: number; volume?: number; last_updated?: number }>>()

  io.on('connection', (socket) => {
    log('client connected', socket.id)

    socket.on('subscribe', async (payload: { limit?: number; sortBy?: string; period?: string } = {}) => {
      try {
        const rk = roomKey(payload)
        socket.join(rk)
        // initialize room state if missing
        if (!roomState.has(rk)) roomState.set(rk, new Map())

        // send snapshot page for subscription
        const tokens = await readTokensFromCache()
        const page = tokens.slice(0, payload.limit ?? 20)
        socket.emit('snapshot', page)

        // populate room state last-known values from snapshot
        const state = roomState.get(rk)!
        for (const t of page) {
          state.set(t.token_address, { price: t.price_sol, volume: t.volume_sol, last_updated: t.last_updated })
        }
      } catch (e) {
        socket.emit('error', 'failed to fetch snapshot')
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

  // watch loop: poll cached tokens frequently and compute per-room diffs
  async function watchLoop() {
    try {
      const tokens = await readTokensFromCache()
      if (!tokens || tokens.length === 0) {
        // nothing to do; schedule next iteration
        setTimeout(watchLoop, 1000 * Math.max(1, Math.min(CACHE_TTL_SECONDS, 5)))
        return
      }

      // For each room, compute diffs and emit token_updates only for changed tokens
      for (const [rk, state] of roomState.entries()) {
        const updates: any[] = []

        // we can apply room filtering if needed; for now use state to detect deltas against cached tokens
        for (const t of tokens) {
          const prev = state.get(t.token_address)
          const priceChanged = priceChangedEnough(prev?.price, t.price_sol)
          const volumeSpiked = volumeSpikedEnough(prev?.volume, t.volume_sol)

          // only emit if either condition true and last_updated is newer
          const isNewer = !prev?.last_updated || (t.last_updated && t.last_updated > prev.last_updated)
          if ((priceChanged || volumeSpiked) && isNewer) {
            updates.push(tokenDeltaPayload(t))
            // update state
            state.set(t.token_address, { price: t.price_sol, volume: t.volume_sol, last_updated: t.last_updated })
          }
        }

        if (updates.length) {
          // emit to that room only
          io.to(rk).emit('token_updates', updates)
        }
      }
    } catch (e) {
      // log error and continue
      // eslint-disable-next-line no-console
      console.error('ws watchLoop error', e)
    } finally {
      // schedule next check; small interval to mimic near-realtime
      setTimeout(watchLoop, 1000 * 3)
    }
  }

  // start the loop
  watchLoop()

  return io
}
