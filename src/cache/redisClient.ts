// src/cache/redisClient.ts
import { REDIS_URL } from '../config'

let redis: any

if (process.env.NODE_ENV === 'test') {
  // use mock in tests to avoid network dependency
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RedisMock = require('ioredis-mock')
  redis = new RedisMock()
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const IORedis = require('ioredis')
  redis = new IORedis(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    connectTimeout: 10_000,
    enableReadyCheck: true,
    enableOfflineQueue: false,
    retryStrategy(times: number) {
      if (times >= 8) return null
      return Math.min(1000 * Math.pow(2, times), 30_000)
    }
  })

  // attempt connect but don't crash if it fails immediately
  redis.connect().catch((err: any) => {
    // eslint-disable-next-line no-console
    console.error('Redis initial connect error', err && err.message ? err.message : err)
  })
}

if (redis && typeof redis.on === 'function') {
  redis.on('error', (err: any) => {
    // eslint-disable-next-line no-console
    console.error('Redis error', err && err.message ? err.message : err)
  })
  redis.on('ready', () => {
    // eslint-disable-next-line no-console
    console.log('Redis ready')
  })
}

export default redis

export async function closeRedis(): Promise<void> {
  try {
    if (!redis) return
    if (typeof redis.quit === 'function') await redis.quit()
    else if (typeof redis.disconnect === 'function') redis.disconnect()
  } catch (e) {
    // ignore
  }
}
