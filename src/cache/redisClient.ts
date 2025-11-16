// src/cache/redisClient.ts
import { REDIS_URL } from '../config'

let redis: any = null
let isMock = false

if (process.env.NODE_ENV === 'test') {
  // keep tests fast & deterministic
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RedisMock = require('ioredis-mock')
  redis = new RedisMock()
  isMock = true
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IORedis = require('ioredis')

  redis = new IORedis(REDIS_URL, {
    // Upstash / serverless friendly
    tls: {},                   // required for rediss://
    enableReadyCheck: false,   // Upstash doesn't support READY checks reliably
    enableOfflineQueue: false, // we will avoid issuing commands until connected
    maxRetriesPerRequest: 50,
    connectTimeout: 10000,
    lazyConnect: true,         // create instance but connect manually to control timing
    retryStrategy(times: number) {
      // exponential backoff with cap
      return Math.min(200 + times * 200, 2000)
    },
    reconnectOnError(err: Error) {
      if (!err) return false
      const m = err.message ?? ''
      return m.includes('ECONNRESET') || m.includes('ECONNREFUSED') || m.includes('EPIPE')
    },
  })
}

// basic logging
if (redis && typeof redis.on === 'function') {
  redis.on('error', (err: any) => {
    // eslint-disable-next-line no-console
    console.error('Redis error', err && err.message ? err.message : err)
  })
  redis.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log('Redis ready')
  })
  redis.on('connect', () => {
    // eslint-disable-next-line no-console
    console.log('Redis connect event')
  })
}

/**
 * Try to connect once at startup with timeout.
 * If connection fails, we log and return — the app continues with an "empty cache" behavior.
 */
async function tryConnectOnce(timeoutMs = 10_000): Promise<void> {
  if (!redis || isMock) return

  // If already connected/connecting, skip
  if (redis.status === 'ready' || redis.status === 'connecting') {
    // eslint-disable-next-line no-console
    console.log('Redis already connecting/connected:', redis.status)
    return
  }

  // connect() returns a Promise — race it with a timeout
  try {
    const connectPromise = redis.connect() // using lazyConnect: true, so explicit connect()
    await Promise.race([
      connectPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('connect_timeout')), timeoutMs)),
    ])
    // connected successfully
    // eslint-disable-next-line no-console
    console.log('Redis connected successfully')
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('Redis connect failed, returning empty cache', err && err.message ? err.message : err)
    // Do not throw — keep app alive. Commands should check readiness where used.
  }
}

// attempt connection immediately (no await so startup isn't blocked heavily)
void tryConnectOnce(10_000)

export default redis

export async function closeRedis(): Promise<void> {
  try {
    if (!redis) return
    if (typeof redis.quit === 'function') await redis.quit()
    else if (typeof redis.disconnect === 'function') redis.disconnect()
  } catch {
    // ignore
  }
}
