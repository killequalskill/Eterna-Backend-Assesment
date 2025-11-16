// src/routes/tokens.ts
import express from 'express'
import { readTokensFromCache } from '../services/aggregator'
import { paginateTokens, decodeCursor, encodeCursor } from '../utils/pagination'
import { TokenRecord, Period } from '../types'

const router = express.Router()

type SortBy = 'volume' | 'market_cap' | 'price_change'

// helper: extract numeric safely
function asNum(v: any): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

// GET /tokens
// query params:
//   limit (number)
//   cursor (string - base64 encoded cursor)
//   sortBy = volume|market_cap|price_change
//   period = 1h|24h|7d
//   minPriceChange = numeric (optional filter)
router.get('/', async (req, res) => {
  try {
    // parse/validate inputs
    const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)))
    const cursor = req.query.cursor as string | undefined
    const sortBy = (req.query.sortBy as string || 'volume') as SortBy
    const period = (req.query.period as Period) || '24h'
    const minPriceChange = req.query.minPriceChange !== undefined ? asNum(req.query.minPriceChange) : undefined

    // read cached tokens
    const tokens = await readTokensFromCache()

    // attach normalized 'price_change' field according to period so sorting & filtering can use it
    const transformed = tokens.map((t) => {
      const priceChange =
        period === '1h'
          ? (t.price_1hr_change ?? t.price_24hr_change ?? t.price_7d_change ?? 0)
          : period === '24h'
          ? (t.price_24hr_change ?? t.price_1hr_change ?? t.price_7d_change ?? 0)
          : (t.price_7d_change ?? t.price_24hr_change ?? t.price_1hr_change ?? 0)

      // return a shallow copy with derived price_change for consistent client usage
      return {
        ...t,
        price_change: priceChange
      } as TokenRecord & { price_change: number }
    })

    // optional filtering by minPriceChange (if provided)
    const filtered = typeof minPriceChange === 'number'
      ? transformed.filter((t) => {
          const pc = (t as any).price_change
          return typeof pc === 'number' && Math.abs(pc) >= minPriceChange
        })
      : transformed

    // choose sort key
    let sortKey: keyof (TokenRecord & { price_change?: number }) = 'volume_sol'
    if (sortBy === 'market_cap') sortKey = 'market_cap_sol'
    else if (sortBy === 'price_change') sortKey = 'price_change'

    // sort descending by chosen key (missing values move to end)
    const sorted = filtered.sort((a: any, b: any) => {
      const av = a[sortKey] ?? -Infinity
      const bv = b[sortKey] ?? -Infinity
      if (av === bv) {
        // stable fallback: liquidity then address
        const altA = a.liquidity_sol ?? 0
        const altB = b.liquidity_sol ?? 0
        if (altA === altB) return (a.token_address || '').localeCompare(b.token_address || '')
        return altB - altA
      }
      return (bv as number) - (av as number)
    })

    // paginate using existing helper (cursor holds token_address & last sort value if needed)
    // we need cursor logic to use token_address only for stable paging
    const decodedCursor = decodeCursor(cursor)
    let startIndex = 0
    if (decodedCursor && decodedCursor.lastKey) {
      const idx = sorted.findIndex((t) => t.token_address === decodedCursor.lastKey)
      if (idx >= 0) startIndex = idx + 1
      else startIndex = 0
    }
    const items = sorted.slice(startIndex, startIndex + limit)

    // build nextCursor if more items exist
    let nextCursor: string | null = null
    if (startIndex + limit < sorted.length) {
      const last = items[items.length - 1]
      nextCursor = encodeCursor({ lastKey: last.token_address, lastValue: (last as any)[sortKey] ?? null })
    }

    // return items (explicitly include price_change for client clarity)
    return res.json({
      items,
      nextCursor
    })
  } catch (e) {
    // safe fallback
    // eslint-disable-next-line no-console
    console.error('tokens route error', e)
    return res.status(500).json({ error: 'failed to read tokens' })
  }
})

export default router
