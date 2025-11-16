// src/services/aggregator.ts
import cron from 'node-cron'
import redis from '../cache/redisClient'
import { CACHE_TTL_SECONDS, AGGREGATOR_INTERVAL_SECONDS, DEXSCREENER_MAX_CONCURRENCY } from '../config'
import { TokenRecord } from '../types'
import { searchDexscreener, getTokenDexscreener } from './dexscreener'
import { searchJupiter } from './jupiter'
import pLimit from 'p-limit'
import { mergeTokenRecords } from '../utils/merge'
import debug from 'debug'

const log = debug('app:aggregator')

// Redis key prefix
const TOKENS_KEY = 'tokens:all'

// helper: write token to redis (hash per token_address or single list serialized)
// For simplicity we store a JSON blob with all tokens under TOKENS_KEY
export async function saveTokensToCache(tokens: TokenRecord[]) {
  const payload = JSON.stringify(tokens)
  await redis.set(TOKENS_KEY, payload, 'EX', CACHE_TTL_SECONDS)
  log('Saved tokens to cache', tokens.length)
}

// read cached tokens (returns array)
export async function readTokensFromCache(): Promise<TokenRecord[]> {
  const raw = await redis.get(TOKENS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as TokenRecord[]
    return parsed
  } catch (e) {
    return []
  }
}

// core: aggregate from multiple sources
export async function aggregateOnce(): Promise<TokenRecord[]> {
  log('Starting aggregation once')
  // fetch candidate tokens from DEXs with cautious concurrency
  // we search for broad queries that likely return many meme coins: "SOL" + popular patterns
  // For this demo we fetch dexscreener search for "sol" and jupiter search for "SOL"
  const limit = pLimit(DEXSCREENER_MAX_CONCURRENCY)

  const [dexList, jupList] = await Promise.all([
    // dexscreener search - broad
    searchDexscreener('sol'),
    // jupiter search
    searchJupiter('SOL')
  ])

  // combine lists
  const combined = [...dexList, ...jupList]

  // reduce and merge duplicates by token_address (normalized lowercased)
  const map = new Map<string, TokenRecord>()
  for (const t of combined) {
    const key = t.token_address.toLowerCase()
    if (!map.has(key)) {
      map.set(key, t)
    } else {
      const prev = map.get(key)!
      const merged = mergeTokenRecords(prev, t)
      map.set(key, merged)
    }
  }

  const mergedArray = Array.from(map.values())
  // save to redis
  await saveTokensToCache(mergedArray)
  log('Aggregation complete', mergedArray.length)
  return mergedArray
}

// background job starter (cron based)
let taskStarted = false
export function startAggregator(cronIntervalSeconds?: number) {
  if (taskStarted) return
  taskStarted = true

  // use node-cron: run every AGGREGATOR_INTERVAL_SECONDS
  // node-cron uses cron format; for small intervals use setInterval instead but we'll schedule dynamic cron
  const interval = cronIntervalSeconds ?? AGGREGATOR_INTERVAL_SECONDS
  // run immediately then schedule
  aggregateOnce().catch((e) => {
    log('Initial aggregation error', e)
  })

  // schedule repeating
  setInterval(() => {
    aggregateOnce().catch((e) => {
      log('Scheduled aggregation error', e)
    })
  }, interval * 1000)
}
