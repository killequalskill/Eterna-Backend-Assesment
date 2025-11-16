// src/services/jupiter.ts
import client from '../http/axiosClient'
import { TokenRecord } from '../types'
import { JUPITER_API_URL } from '../config'

// wrapper for jupiter search
export async function searchJupiter(query: string): Promise<TokenRecord[]> {
  const url = JUPITER_API_URL.replace('SOL', encodeURIComponent(query))
  const res = await client.get(url)
  const data = res.data
  // attempt to parse returned tokens, adjust according to actual structure
  const list = data.data ?? data.tokens ?? data ?? []
  const tokens: TokenRecord[] = (Array.isArray(list) ? list : []).map((t: any) => {
    return {
      token_address: (t.address || t.mint || '').toString(),
      token_name: t.name || t.tokenName || undefined,
      token_ticker: t.symbol || t.token_ticker || undefined,
      price_sol: Number(t.priceUsd || t.price || undefined) || undefined,
      liquidity_sol: Number(t.liquidity || undefined) || undefined,
      market_cap_sol: Number(t.marketCap || undefined) || undefined,
      volume_sol: Number(t.volume || undefined) || undefined,
      price_1hr_change: Number(t.change1h || undefined) || undefined,
      price_24hr_change: Number(t.change24h || undefined) || undefined,
      price_7d_change: Number(t.change7d || undefined) || undefined,
      protocol: t.protocol || 'jupiter',
      sources: ['jupiter'],
      last_updated: Date.now()
    }
  }).filter((r: TokenRecord) => r.token_address)

  return tokens
}
