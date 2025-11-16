// src/routes/admin.ts
import express from 'express'
import { aggregateOnce } from '../services/aggregator'
import debug from 'debug'
import { Request, Response } from 'express'

const log = debug('app:admin')
const router = express.Router()

// Optional lightweight protection: if ADMIN_KEY is set in env, require it in header X-ADMIN-KEY
const ADMIN_KEY = process.env.ADMIN_KEY || ''

// POST /admin/aggregate
// triggers immediate aggregation (useful for demo)
router.post('/aggregate', async (req: Request, res: Response) => {
  try {
    if (ADMIN_KEY) {
      const key = (req.header('x-admin-key') || '')
      if (key !== ADMIN_KEY) {
        return res.status(403).json({ error: 'forbidden' })
      }
    }
    const tokens = await aggregateOnce()
    log('manual aggregation triggered, tokens:', tokens.length)
    return res.json({ ok: true, count: tokens.length })
  } catch (err: any) {
    log('aggregate error', err)
    return res.status(500).json({ error: 'aggregation failed' })
  }
})

export default router
