import Redis from 'ioredis'
import { REDIS_URL } from '../config'

const redis = new Redis(REDIS_URL, {
  tls: {},
  enableReadyCheck: false,
  maxRetriesPerRequest: 50,
  retryStrategy(times) {
    return Math.min(200 + times * 200, 2000)
  },
  reconnectOnError(err) {
    if (!err) return false
    const msg = err.message || ''
    if (
      msg.includes('ECONNRESET') ||
      msg.includes('EPIPE') ||
      msg.includes('ECONNREFUSED')
    ) {
      return true
    }
    return false
  },
})

redis.on('error', (err) => {
  console.error('Redis error', err.message)
})

export default redis
