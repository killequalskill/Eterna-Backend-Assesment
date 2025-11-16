// src/routes/tokens.ts
import express from 'express'
import { readTokensFromCache } from '../services/aggregator'
import { paginateTokens } from '../utils/pagination'
import { TokenRecord, Period } from '../types'

const router = express.Router()

// GET /tokens
// query params: limit, cursor, sortBy (volume|price_change|market_cap), period (1h|24h|7d)
router.get('/', async (req, res) => {
  const limit = Number(req.query.limit || 20)
  const cursor = req.query.cursor as string | undefined
  const sortBy = (req.query.sortBy as string) || 'volume'
  const period = (req.query.period as Period) || '24h'

  try {
    const tokens = await readTokensFromCache()

    // choose sort key
    let sortKey: keyof TokenRecord = 'volume_sol'
    if (sortBy === 'market_cap') sortKey = 'market_cap_sol'
    else if (sortBy === 'price_change') {
      if (period === '1h') sortKey = 'price_1hr_change'
      else if (period === '24h') sortKey = 'price_24hr_change'
      else sortKey = 'price_7d_change'
    }

    // sort descending by chosen key (missing values move to end)
    const sorted = tokens.sort((a, b) => {
      const av = (a as any)[sortKey] ?? -Infinity
      const bv = (b as any)[sortKey] ?? -Infinity
      if (av === bv) {
        // fallback: by liquidity then address
        const altA = a.liquidity_sol ?? 0
        const altB = b.liquidity_sol ?? 0
        if (altA === altB) return (a.token_address || '').localeCompare(b.token_address || '')
        return altB - altA
      }
      return (bv as number) - (av as number)
    })

    const { items, nextCursor } = paginateTokens(sorted, limit, cursor, sortKey)

    res.json({ items, nextCursor })
  } catch (e) {
    res.status(500).json({ error: 'failed to read tokens' })
  }
})

export default router
