// src/routes/admin.ts
import express from 'express'
import { aggregateOnce } from '../services/aggregator'
import debug from 'debug'
import { Request, Response } from 'express'

const log = debug('app:admin')
const router = express.Router()

// optional admin key
const ADMIN_KEY = process.env.ADMIN_KEY || ''

// POST /admin/aggregate
router.post('/aggregate', async (req: Request, res: Response) => {
  try {
    if (ADMIN_KEY) {
      const key = (req.header('x-admin-key') || '')
      if (key !== ADMIN_KEY) {
        return res.status(403).json({ error: 'forbidden' })
      }
    }

    // aggregateOnce is hardened with timeouts; call it directly
    const tokens = await aggregateOnce()
    log('manual aggregation triggered, tokens:', tokens.length)
    return res.json({ ok: true, count: tokens.length })
  } catch (err: any) {
    // eslint-disable-next-line no-console
    console.error('admin aggregate error', err)
    return res.status(500).json({ error: 'aggregation failed' })
  }
})

export default router
