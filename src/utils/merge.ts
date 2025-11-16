// src/utils/merge.ts
import { TokenRecord } from '../types'

// merge two token records into one canonical record
// strategy: prefer fields that are present; for numeric fields prefer the one with higher liquidity
export function mergeTokenRecords(a: TokenRecord, b: TokenRecord): TokenRecord {
  // ensure token_address matches
  const addr = a.token_address || b.token_address
  const now = Date.now()
  const sources = Array.from(new Set([...(a.sources || []), ...(b.sources || [])]))

  // helper to pick better numeric field based on liquidity
  function pickNumeric(field: keyof TokenRecord): number | undefined {
    const av = a[field] as unknown as number | undefined
    const bv = b[field] as unknown as number | undefined
    if (av == null) return bv
    if (bv == null) return av
    const al = a.liquidity_sol ?? 0
    const bl = b.liquidity_sol ?? 0
    return al >= bl ? av : bv
  }

  const merged: TokenRecord = {
    token_address: addr!,
    token_name: a.token_name || b.token_name,
    token_ticker: a.token_ticker || b.token_ticker,
    price_sol: pickNumeric('price_sol'),
    market_cap_sol: pickNumeric('market_cap_sol'),
    volume_sol: pickNumeric('volume_sol'),
    liquidity_sol: pickNumeric('liquidity_sol'),
    transaction_count: pickNumeric('transaction_count'),
    price_1hr_change: pickNumeric('price_1hr_change'),
    price_24hr_change: pickNumeric('price_24hr_change'),
    price_7d_change: pickNumeric('price_7d_change'),
    protocol: a.protocol || b.protocol,
    sources,
    last_updated: now
  }
  return merged
}
