// src/http/axiosClient.ts
import axios from 'axios'
import axiosRetry from 'axios-retry'

// create axios instance shared across services
const client = axios.create({
  timeout: 10_000
})

// install retry with exponential backoff
axiosRetry(client, {
  retries: 4,
  // exponential delay
  retryDelay: (retryCount) => {
    return Math.pow(2, retryCount) * 500
  },
  // retry on network errors or 429/5xx
  retryCondition: (error) => {
    if (!error) return false
    if (error.response && error.response.status === 429) return true
    return axiosRetry.isNetworkOrIdempotentRequestError(error)
  }
})

export default client
