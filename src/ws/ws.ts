// src/ws/ws.ts
import { Server as IOServer } from 'socket.io'
import { Server as HTTPServer } from 'http'
import { readTokensFromCache } from '../services/aggregator'
import { TokenRecord } from '../types'
import debug from 'debug'
import {
  WS_PRICE_CHANGE_THRESHOLD,
  WS_VOLUME_SPIKE_FACTOR,
  WS_WATCH_INTERVAL,
  WS_ROOM_CLEANUP_SECONDS
} from '../config'

const log = debug('app:ws')

// simple utility for percent change
function priceChangedEnough(oldPrice?: number, newPrice?: number) {
  if (oldPrice == null || newPrice == null) return true
  if (oldPrice === 0) return true
  const diff = Math.abs((newPrice - oldPrice) / oldPrice) * 100
  return diff >= WS_PRICE_CHANGE_THRESHOLD
}

// volume spike detection
function volumeSpikedEnough(oldVol?: number, newVol?: number) {
  if (oldVol == null || newVol == null) return true
  if (oldVol === 0) return newVol > 0
  return newVol >= oldVol * WS_VOLUME_SPIKE_FACTOR
}

// minimal delta payload
function tokenDeltaPayload(t: TokenRecord) {
  return {
    token_address: t.token_address,
    token_name: t.token_name,
    token_ticker: t.token_ticker,
    price_sol: t.price_sol,
    volume_sol: t.volume_sol,
    market_cap_sol: t.market_cap_sol,
    liquidity_sol: t.liquidity_sol,
    price_change: t.price_24hr_change ?? t.price_1hr_change ?? t.price_7d_change,
    last_updated: t.last_updated
  }
}

// stable key for a room based on subscription parameters
function roomKey(opts: { limit?: number; sortBy?: string; period?: string }) {
  return `${opts.sortBy || 'volume'}:${opts.period || '24h'}:limit=${opts.limit || 20}`
}

// internal structure:
// roomState = {
//   "volume:24h:limit=20" -> Map(tokenAddress -> { price, volume, updatedAt })
// }
const roomState = new Map<
  string,
  Map<string, { price?: number; volume?: number; last_updated?: number }>
>()

let watchLoopRunning = false
let watchLoopTimer: NodeJS.Timeout | null = null
let lastRoomCleanup = Date.now()

// remove empty rooms periodically
function cleanupEmptyRooms(io: IOServer) {
  const now = Date.now()
  if (now - lastRoomCleanup < WS_ROOM_CLEANUP_SECONDS * 1000) return
  lastRoomCleanup = now

  for (const rk of Array.from(roomState.keys())) {
    // if no sockets left in this room, delete its state
    const room = io.sockets.adapter.rooms.get(rk)
    if (!room || room.size === 0) {
      roomState.delete(rk)
      log('cleaned empty room:', rk)
    }
  }
}

// watchLoop: regularly check Redis cached tokens and broadcast deltas
async function runWatchLoop(io: IOServer) {
  if (watchLoopRunning) return
  watchLoopRunning = true

  try {
    const tokens = await readTokensFromCache()
    if (tokens && tokens.length) {
      for (const [rk, state] of roomState.entries()) {
        const out: any[] = []
        for (const t of tokens) {
          const prev = state.get(t.token_address)
          const priceOk = priceChangedEnough(prev?.price, t.price_sol)
          const volOk = volumeSpikedEnough(prev?.volume, t.volume_sol)
          const isNewer =
            !prev?.last_updated || (t.last_updated && t.last_updated > prev.last_updated)

          if ((priceOk || volOk) && isNewer) {
            out.push(tokenDeltaPayload(t))
            state.set(t.token_address, {
              price: t.price_sol,
              volume: t.volume_sol,
              last_updated: t.last_updated
            })
          }
        }
        if (out.length) io.to(rk).emit('token_updates', out)
      }
    }
  } catch (err: any) {
    // swallow errors to avoid crashing loop
    console.error('ws watchLoop error', err?.message || err)
  } finally {
    cleanupEmptyRooms(io)
    watchLoopRunning = false
    watchLoopTimer = setTimeout(() => runWatchLoop(io), WS_WATCH_INTERVAL)
  }
}

// Start WebSocket server and begin watch loop
export function startWebsocket(server: HTTPServer) {
  const io = new IOServer(server, {
    cors: { origin: '*' }
  })

  io.on('connection', (socket) => {
    log('ws connected', socket.id)

    socket.on('subscribe', async (opts = {}) => {
      const rk = roomKey(opts)
      socket.join(rk)

      if (!roomState.has(rk)) roomState.set(rk, new Map())

      try {
        const tokens = await readTokensFromCache()
        const limit = opts.limit ?? 20
        const page = tokens.slice(0, limit)
        socket.emit('snapshot', page)

        const state = roomState.get(rk)!
        for (const t of page) {
          state.set(t.token_address, {
            price: t.price_sol,
            volume: t.volume_sol,
            last_updated: t.last_updated
          })
        }
      } catch (e) {
        socket.emit('error', 'snapshot failed')
      }
    })

    socket.on('unsubscribe', (opts = {}) => {
      socket.leave(roomKey(opts))
    })

    // socket.io already sends ping/pong, but we add a manual one for UI demo
    socket.on('ping', () => socket.emit('pong'))

    socket.on('disconnect', () => {
      log('ws disconnect', socket.id)
    })
  })

  // start periodic watch loop
  runWatchLoop(io)
  return io
}

// clean stop function (optional for tests)
export function stopWebsocket() {
  if (watchLoopTimer) clearTimeout(watchLoopTimer)
  watchLoopTimer = null
  watchLoopRunning = false
}
