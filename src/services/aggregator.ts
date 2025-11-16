// src/services/aggregator.ts
import redis from '../cache/redisClient'
import { CACHE_TTL_SECONDS, AGGREGATOR_INTERVAL_SECONDS, DEXSCREENER_MAX_CONCURRENCY } from '../config'
import { TokenRecord } from '../types'
import { searchDexscreener } from './dexscreener'
import { searchJupiter } from './jupiter'
import pLimit from 'p-limit'
import { mergeTokenRecords } from '../utils/merge'
import debug from 'debug'

const log = debug('app:aggregator')

// Redis key for the serialized token list
const TOKENS_KEY = 'tokens:all'

// write tokens to redis as a JSON blob with TTL
export async function saveTokensToCache(tokens: TokenRecord[]) {
  try {
    const payload = JSON.stringify(tokens)
    await redis.set(TOKENS_KEY, payload, 'EX', CACHE_TTL_SECONDS)
    log('Saved tokens to cache', tokens.length)
  } catch (e) {
    // don't throw on cache write failure; log for debugging
    // eslint-disable-next-line no-console
    console.error('saveTokensToCache error', e)
  }
}

// read cached tokens; returns [] on any error or empty cache
export async function readTokensFromCache(): Promise<TokenRecord[]> {
  try {
    const raw = await redis.get(TOKENS_KEY)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw) as TokenRecord[]
      return parsed
    } catch (e) {
      // corrupted payload -> return empty
      return []
    }
  } catch (e) {
    // redis error or connection closed -> return empty
    // eslint-disable-next-line no-console
    console.error('readTokensFromCache error', e)
    return []
  }
}

// helper: ensure a promise resolves within ms or fallback value returned
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let done = false
    const timer = setTimeout(() => {
      if (!done) {
        done = true
        resolve(fallback)
      }
    }, ms)

    p.then((v) => {
      if (!done) {
        done = true
        clearTimeout(timer)
        resolve(v)
      }
    }).catch(() => {
      if (!done) {
        done = true
        clearTimeout(timer)
        resolve(fallback)
      }
    })
  })
}

// internal helper to fetch from both sources with protection
async function fetchFromSources(): Promise<TokenRecord[]> {
  // run search calls concurrently but guarded; search functions should themselves limit per-token fetches
  // use pLimit to protect any internal concurrency if you later expand to per-token fetching
  const limit = pLimit(DEXSCREENER_MAX_CONCURRENCY || 5)

  // wrap each call in limit() so concurrency control can be applied uniformly
  const dexTask = limit(() => searchDexscreener('sol'))
  const jupTask = limit(() => searchJupiter('SOL'))

  // allow each source up to 10s to respond via withTimeout; return [] on failure
  const [dexList, jupList] = await Promise.all([
    withTimeout(dexTask, 10000, [] as TokenRecord[]),
    withTimeout(jupTask, 10000, [] as TokenRecord[])
  ])

  // merge duplicates by token_address
  const combined = [...(dexList || []), ...(jupList || [])]
  const map = new Map<string, TokenRecord>()
  for (const t of combined) {
    if (!t || !t.token_address) continue
    const key = t.token_address.toLowerCase()
    if (!map.has(key)) {
      map.set(key, t)
    } else {
      const prev = map.get(key)!
      const merged = mergeTokenRecords(prev, t)
      map.set(key, merged)
    }
  }

  return Array.from(map.values())
}

// main aggregation function: safe, returns [] on error
export async function aggregateOnce(): Promise<TokenRecord[]> {
  log('Starting aggregation once')
  try {
    const tokens = await fetchFromSources()
    // persist what we have (even if empty)
    await saveTokensToCache(tokens)
    log('Aggregation complete', tokens.length)
    return tokens
  } catch (e) {
    // keep aggregator resilient: log and return empty
    // eslint-disable-next-line no-console
    console.error('aggregateOnce error', e)
    try {
      await saveTokensToCache([])
    } catch {}
    return []
  }
}

// background aggregator interval handling
let aggregatorInterval: NodeJS.Timeout | null = null
let aggregatorStarted = false

// start periodic aggregator (idempotent)
export function startAggregator(intervalSeconds?: number) {
  if (aggregatorStarted) return
  aggregatorStarted = true

  const interval = Math.max(5, Math.floor(intervalSeconds ?? AGGREGATOR_INTERVAL_SECONDS ?? 30))

  // run immediately (fire-and-forget)
  aggregateOnce().catch((e) => {
    log('Initial aggregation error', e)
  })

  // schedule repeating with setInterval
  aggregatorInterval = setInterval(() => {
    aggregateOnce().catch((e) => {
      log('Scheduled aggregation error', e)
    })
  }, interval * 1000)

  log('Aggregator started, intervalSeconds=%d', interval)
}

// stop periodic aggregator (useful for tests/cleanup)
export function stopAggregator() {
  if (aggregatorInterval) {
    clearInterval(aggregatorInterval)
    aggregatorInterval = null
  }
  aggregatorStarted = false
  log('Aggregator stopped')
}
