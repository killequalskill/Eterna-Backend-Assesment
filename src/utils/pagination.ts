// src/utils/pagination.ts
import { TokenRecord } from '../types'

// cursor is base64 encoded JSON: { lastKey: string, lastValue: number }
// encode/decode helpers
export function encodeCursor(payload: any): string {
  const s = JSON.stringify(payload)
  return Buffer.from(s).toString('base64')
}

export function decodeCursor(cursor?: string): any | null {
  if (!cursor) return null
  try {
    const s = Buffer.from(cursor, 'base64').toString('utf8')
    return JSON.parse(s)
  } catch (e) {
    return null
  }
}

// cursor-based pagination: perform simple in-memory pagination for given sorted array
export function paginateTokens(sorted: TokenRecord[], limit = 20, cursor?: string, sortKey?: keyof TokenRecord) {
  const decoded = decodeCursor(cursor)
  let startIndex = 0
  if (decoded && decoded.lastKey) {
    // find first index after lastKey and lastValue
    startIndex = sorted.findIndex((t) => t.token_address === decoded.lastKey)
    if (startIndex >= 0) startIndex = startIndex + 1
    else startIndex = 0
  }
  const items = sorted.slice(startIndex, startIndex + limit)
  let nextCursor = null
  if (items.length === limit) {
    const last = items[items.length - 1]
    nextCursor = encodeCursor({ lastKey: last.token_address, lastValue: (last as any)[sortKey || 'price_sol'] ?? null })
  }
  return { items, nextCursor }
}
