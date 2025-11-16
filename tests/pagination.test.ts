// tests/pagination.test.ts
import { paginateTokens, encodeCursor, decodeCursor } from '../src/utils/pagination'
import { TokenRecord } from '../src/types'

function make(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    token_address: `A${i}`,
    price_sol: i
  })) as TokenRecord[]
}

describe('pagination', () => {
  test('encode/decode cursor', () => {
    const c = encodeCursor({ lastKey: 'A1', lastValue: 10 })
    const d = decodeCursor(c)
    expect(d.lastKey).toBe('A1')
    expect(d.lastValue).toBe(10)
  })

  test('paginates correctly', () => {
    const arr = make(50)
    const { items, nextCursor } = paginateTokens(arr, 10, undefined, 'price_sol')
    expect(items.length).toBe(10)
    expect(nextCursor).toBeTruthy()
    const c2 = nextCursor as string
    const { items: items2 } = paginateTokens(arr, 10, c2, 'price_sol')
    expect(items2.length).toBe(10)
  })
})
