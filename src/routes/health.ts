// src/routes/health.ts
import express from 'express'

const router = express.Router()

// Simple health check used by CI / load balancers / demo scripts.
// Returns small useful payload (uptime + timestamp + optional service name).
router.get('/', (_req, res) => {
  return res.json({
    ok: true,
    service: 'meme-agg-service',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: Date.now()
  })
})

export default router
