// src/cache/redisClient.ts
import Redis from 'ioredis'
import { REDIS_URL } from '../config'

const redis = new Redis(REDIS_URL)

redis.on('error', (err) => {
  // lightweight error logging
  // do not crash on redis error; handle gracefully in code
  // production: add reconnection strategy & alerting
  // eslint-disable-next-line no-console
  console.error('Redis error', err.message)
})

export default redis
