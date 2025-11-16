// src/types.ts
export type Period = '1h' | '24h' | '7d'

// canonical token shape used by the service
export interface TokenRecord {
  token_address: string
  token_name?: string
  token_ticker?: string
  price_sol?: number
  market_cap_sol?: number
  volume_sol?: number
  liquidity_sol?: number
  transaction_count?: number
  price_1hr_change?: number
  price_24hr_change?: number
  price_7d_change?: number
  protocol?: string
  sources?: string[] // list of source identifiers
  last_updated?: number // epoch ms
}
