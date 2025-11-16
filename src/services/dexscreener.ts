// src/services/dexscreener.ts
import client from '../http/axiosClient'
import { TokenRecord } from '../types'

// lightweight wrapper for DexScreener endpoints
const DEXSCREENER_SEARCH = 'https://api.dexscreener.com/latest/dex/search'
const DEXSCREENER_TOKEN = 'https://api.dexscreener.com/latest/dex/tokens' // /{tokenAddress}

// parse tokens from dexscreener response to TokenRecord[]
export async function searchDexscreener(query: string): Promise<TokenRecord[]> {
  const url = `${DEXSCREENER_SEARCH}?q=${encodeURIComponent(query)}`
  const res = await client.get(url)
  const data = res.data

  // DexScreener returns data.tokens or data.pairs depending on query
  // map safe-guarding if structure differs
  const list = data.tokens ?? data.pairs ?? []
  const tokens: TokenRecord[] = list.map((t: any) => {
    // convert to our canonical TokenRecord shape
    return {
      token_address: (t.address || t.tokenAddress || '').toString(),
      token_name: t.name || t.token_name || t.symbol || undefined,
      token_ticker: t.symbol || t.token_ticker || undefined,
      price_sol: Number(t.priceUsd || t.price || t.price_sol) || undefined,
      volume_sol: Number(t.volume || t.volumeUsd) || undefined,
      liquidity_sol: Number(t.liquidity || t.liquidityUsd) || undefined,
      market_cap_sol: Number(t.marketCap || undefined) || undefined,
      transaction_count: Number(t.txCount || undefined) || undefined,
      price_1hr_change: Number(t.priceChange1h || undefined) || undefined,
      price_24hr_change: Number(t.priceChange24h || undefined) || undefined,
      price_7d_change: Number(t.priceChange7d || undefined) || undefined,
      protocol: t.dexId || t.protocol || undefined,
      sources: ['dexscreener'],
      last_updated: Date.now()
    }
  }).filter((r: TokenRecord) => r.token_address)
  return tokens
}

export async function getTokenDexscreener(tokenAddress: string): Promise<TokenRecord | null> {
  const url = `${DEXSCREENER_TOKEN}/${tokenAddress}`
  const res = await client.get(url)
  const data = res.data
  if (!data || !data.result) return null
  const t = data.result
  return {
    token_address: (t.address || tokenAddress).toString(),
    token_name: t.name || undefined,
    token_ticker: t.symbol || undefined,
    price_sol: Number(t.priceUsd || undefined) || undefined,
    liquidity_sol: Number(t.liquidity || undefined) || undefined,
    market_cap_sol: Number(t.marketCap || undefined) || undefined,
    volume_sol: Number(t.volume || undefined) || undefined,
    transaction_count: Number(t.txCount || undefined) || undefined,
    price_1hr_change: Number(t.priceChange1h || undefined) || undefined,
    price_24hr_change: Number(t.priceChange24h || undefined) || undefined,
    price_7d_change: Number(t.priceChange7d || undefined) || undefined,
    protocol: t.protocol || undefined,
    sources: ['dexscreener'],
    last_updated: Date.now()
  }
}
