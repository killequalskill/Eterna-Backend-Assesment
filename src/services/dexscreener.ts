// src/services/dexscreener.ts
import client from '../http/axiosClient'
import { TokenRecord } from '../types'

// lightweight wrapper for DexScreener endpoints
const DEXSCREENER_SEARCH = 'https://api.dexscreener.com/latest/dex/search'
const DEXSCREENER_TOKEN = 'https://api.dexscreener.com/latest/dex/tokens' // /{tokenAddress}

// safe accessor helpers
function asNumber(v: any): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function extractAddress(obj: any): string | undefined {
  return (obj && (obj.address || obj.tokenAddress || obj.token_address || obj.mint))?.toString()
}

function extractName(obj: any): string | undefined {
  return obj?.name || obj?.tokenName || obj?.token_name || obj?.symbol
}

function extractSymbol(obj: any): string | undefined {
  return obj?.symbol || obj?.ticker || obj?.token_ticker
}

// turn a raw candidate into a TokenRecord-ish object (best-effort)
function mapCandidateToToken(c: any): TokenRecord | null {
  if (!c) return null

  // sometimes pair objects contain nested baseToken/quoteToken objects
  const candidate = c.token || c.baseToken || c.quoteToken || c

  const token_address = extractAddress(candidate)
  if (!token_address) return null

  const t: TokenRecord = {
    token_address: token_address,
    token_name: extractName(candidate),
    token_ticker: extractSymbol(candidate),
    price_sol: asNumber(candidate.priceUsd ?? candidate.price ?? candidate.price_sol ?? candidate.price_usd),
    volume_sol: asNumber(candidate.volume ?? candidate.volumeUsd ?? candidate.volume_usd),
    liquidity_sol: asNumber(candidate.liquidity ?? candidate.liquidityUsd ?? candidate.liquidity_usd),
    market_cap_sol: asNumber(candidate.marketCap ?? candidate.market_cap),
    transaction_count: asNumber(candidate.txCount ?? candidate.tx_count),
    price_1hr_change: asNumber(candidate.priceChange1h ?? candidate.change1h ?? candidate.change_1h),
    price_24hr_change: asNumber(candidate.priceChange24h ?? candidate.change24h ?? candidate.change_24h),
    price_7d_change: asNumber(candidate.priceChange7d ?? candidate.change7d ?? candidate.change_7d),
    protocol: candidate.dexId ?? candidate.protocol ?? candidate.source,
    sources: ['dexscreener'],
    last_updated: Date.now()
  }

  return t
}

// parse tokens from dexscreener response to TokenRecord[]
export async function searchDexscreener(query: string): Promise<TokenRecord[]> {
  const url = `${DEXSCREENER_SEARCH}?q=${encodeURIComponent(query)}`
  try {
    const res = await client.get(url)
    const data = res.data || {}

    // possible shapes:
    // - { tokens: [...] }
    // - { pairs: [...] } where each pair may have baseToken/quoteToken objects
    // - other shapes
    let rawList: any[] = []

    if (Array.isArray(data.tokens)) {
      rawList = data.tokens
    } else if (Array.isArray(data.pairs)) {
      // flatten baseToken + quoteToken if present
      rawList = data.pairs.flatMap((p: any) => {
        if (p == null) return []
        // if pair item contains explicit token objects
        if (p.baseToken || p.quoteToken) return [p.baseToken, p.quoteToken]
        // fallback: pair itself might be a token-like object
        return [p]
      })
    } else if (Array.isArray(data)) {
      rawList = data
    } else {
      // try to inspect nested keys (some responses are wrapped differently)
      const candidates = Object.values(data).filter((v) => Array.isArray(v)).flat()
      if (candidates.length) rawList = candidates
    }

    // map candidates to TokenRecord and filter invalid
    const mapped = rawList
      .map(mapCandidateToToken)
      .filter((x): x is TokenRecord => !!x)

    // debug-ish output
    // eslint-disable-next-line no-console
    console.log('DexScreener: mapped tokens count =', mapped.length, ' (rawList=', rawList.length, ')')

    return mapped
  } catch (e: any) {
    // network or parsing error -> log and return empty
    // eslint-disable-next-line no-console
    console.error('searchDexscreener error', e?.message ?? e)
    return []
  }
}

export async function getTokenDexscreener(tokenAddress: string): Promise<TokenRecord | null> {
  const url = `${DEXSCREENER_TOKEN}/${tokenAddress}`
  try {
    const res = await client.get(url)
    const data = res.data || {}
    // many versions return { result: { ... } } or { pairs: [...] }
    const raw = data.result ?? data.data ?? data
    // raw might be an object or an array; find a token-like object
    const candidate = Array.isArray(raw) ? raw.find((r: any) => extractAddress(r) === tokenAddress) : raw
    const mapped = mapCandidateToToken(candidate)
    return mapped
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('getTokenDexscreener error', e?.message ?? e)
    return null
  }
}
