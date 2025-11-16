// src/config.ts
import dotenv from 'dotenv'
dotenv.config()

export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000
export const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'
export const CACHE_TTL_SECONDS = process.env.CACHE_TTL_SECONDS ? Number(process.env.CACHE_TTL_SECONDS) : 30
export const AGGREGATOR_INTERVAL_SECONDS = process.env.AGGREGATOR_INTERVAL_SECONDS ? Number(process.env.AGGREGATOR_INTERVAL_SECONDS) : 20
export const DEXSCREENER_MAX_CONCURRENCY = process.env.DEXSCREENER_MAX_CONCURRENCY ? Number(process.env.DEXSCREENER_MAX_CONCURRENCY) : 10
export const DEXSCREENER_REQUESTS_PER_MIN = process.env.DEXSCREENER_REQUESTS_PER_MIN ? Number(process.env.DEXSCREENER_REQUESTS_PER_MIN) : 250
export const JUPITER_API_URL = process.env.JUPITER_API_URL || 'https://lite-api.jup.ag/tokens/v2/search?query=SOL'
