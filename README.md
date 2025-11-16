# Meme Aggregator Service

A real-time backend that aggregates meme coin data from multiple DEX APIs (DexScreener and Jupiter), merges results into a unified format, caches them in Redis, and exposes both REST and WebSocket interfaces for fast data access and live updates.

---

## Features

### Aggregation
- Fetches from DexScreener and Jupiter.
- Normalizes fields and merges duplicates by token address.
- Uses Redis for caching with configurable TTL.
- Timeout and concurrency protection for external APIs.

### REST API
```
GET /tokens
```
Supports:
- Filtering (liquidity, volume, market cap, price change).
- Time periods: 1h, 24h, 7d.
- Sorting: volume, market cap, price change.
- Cursor-based pagination.

### WebSocket
- Initial snapshot after subscription.
- Delta updates only (price changes and volume spikes).
- Demo at `public/socket-demo.html`.

### Admin
```
POST /admin/aggregate
```
Trigger manual aggregation. Optional `x-admin-key` protection.

### Health
```
GET /health
```

---

## Setup

### Requirements
- Node.js
- Redis (Docker recommended)

### Install
```
npm install
```

### Start Redis
```
docker run -p 6379:6379 redis:7-alpine
```

### Environment Variables (.env)
```
PORT=3000
REDIS_URL=redis://localhost:6379
ADMIN_KEY=secret123
AGGREGATOR_INTERVAL_SECONDS=30
CACHE_TTL_SECONDS=60
```

### Run
```
npm run dev
```

---

## Testing
```
npm test
```

Includes tests for:
- Aggregator
- Redis caching
- Filtering and sorting
- Pagination
- Admin endpoint
- WebSocket snapshot and deltas

---

## API Testing (Insomnia)
Import:
```
insomnia_collection.yaml
```

Contains all REST endpoints and WebSocket examples.

---

## Project Structure

```
src/
  routes/
  services/
  ws/
  utils/
  cache/
public/
tests/
insomnia_collection.yaml
```

---

## Deployment
Deployed to Render, public URL is
https://eterna-backend-assessment.onrender.com

---

## Demo Video
Will add a 1–2 min YouTube demo link here showing:
- REST API
- WebSocket updates
- Admin trigger
- Rapid API calls

---
