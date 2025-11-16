// src/services/jupiter.ts
import client from '../http/axiosClient'
import { TokenRecord } from '../types'
import { JUPITER_API_URL } from '../config'

// helper
function asNumber(v: any): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function mapJupiterItemToToken(t: any): TokenRecord | null {
  if (!t) return null
  // Jupiter search sometimes returns objects with fields: address, mint, symbol, name, priceUsd, change24h etc.
  const addr = (t.address || t.mint || t.id || t.tokenAddress)?.toString()
  if (!addr) return null

  const token: TokenRecord = {
    token_address: addr,
    token_name: t.name || t.tokenName || t.token_name,
    token_ticker: t.symbol || t.token_ticker,
    price_sol: asNumber(t.priceUsd ?? t.price ?? t.price_usd),
    liquidity_sol: asNumber(t.liquidity ?? t.liquidityUsd ?? t.liquidity_usd),
    market_cap_sol: asNumber(t.marketCap ?? t.market_cap),
    volume_sol: asNumber(t.volume ?? t.volumeUsd ?? t.volume_usd),
    price_1hr_change: asNumber(t.change1h ?? t.change_1h),
    price_24hr_change: asNumber(t.change24h ?? t.change_24h ?? t.change24hr ?? t.change_24hr),
    price_7d_change: asNumber(t.change7d ?? t.change_7d),
    protocol: t.protocol ?? 'jupiter',
    sources: ['jupiter'],
    last_updated: Date.now()
  }

  return token
}

export async function searchJupiter(query: string): Promise<TokenRecord[]> {
  try {
    const url = JUPITER_API_URL.replace('SOL', encodeURIComponent(query))
    const res = await client.get(url)
    const data = res.data ?? {}

    // common shapes: { data: [...] } or an array directly
    let list: any[] = []
    if (Array.isArray(data.data)) list = data.data
    else if (Array.isArray(data)) list = data
    else {
      // search for any array inside response
      const arr = Object.values(data).find((v) => Array.isArray(v))
      if (arr) list = arr as any[]
    }

    const mapped = (list || []).map(mapJupiterItemToToken).filter((x): x is TokenRecord => !!x)

    // eslint-disable-next-line no-console
    console.log('Jupiter: mapped tokens count =', mapped.length, ' (raw list=', list.length, ')')

    return mapped
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('searchJupiter error', e?.message ?? e)
    return []
  }
}
