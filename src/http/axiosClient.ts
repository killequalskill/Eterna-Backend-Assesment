// src/http/axiosClient.ts
import axios from 'axios'
import axiosRetry from 'axios-retry'

const client = axios.create({
  timeout: 10_000,
  headers: { 'User-Agent': 'meme-agg-service/1.0' }
})

axiosRetry(client, {
  retries: 4,
  retryDelay: (retryCount, error) => {
    try {
      const ra = error?.response?.headers?.['retry-after']
      if (ra) {
        const n = parseInt(ra, 10)
        if (!isNaN(n)) return n * 1000
        const d = Date.parse(ra)
        if (!isNaN(d)) {
          return Math.min(Math.max(0, d - Date.now()), 30_000)
        }
      }
    } catch (e) {
      // ignore
    }
    return Math.min(500 * Math.pow(2, retryCount - 1), 10_000)
  },
  retryCondition: (error) => {
    if (!error) return false
    if (error.response) {
      const s = error.response.status
      if (s === 429) return true
      if (s >= 500 && s < 600) return true
    }
    return axiosRetry.isNetworkOrIdempotentRequestError(error)
  }
})

export default client
