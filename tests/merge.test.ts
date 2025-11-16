// tests/merge.test.ts
import { mergeTokenRecords } from '../src/utils/merge'
import { TokenRecord } from '../src/types'

describe('mergeTokenRecords', () => {
  test('merges simple records and keeps address', () => {
    const a: TokenRecord = { token_address: 'A', token_name: 'Name A', liquidity_sol: 10, price_sol: 1, sources: ['x'], last_updated: Date.now() }
    const b: TokenRecord = { token_address: 'A', token_ticker: 'A', liquidity_sol: 5, price_sol: 2, sources: ['y'], last_updated: Date.now() }
    const merged = mergeTokenRecords(a, b)
    expect(merged.token_address).toBe('A')
    // price from a (higher liquidity)
    expect(merged.price_sol).toBe(1)
    expect(merged.sources).toContain('x')
    expect(merged.sources).toContain('y')
  })

  test('picks numeric values when other is missing', () => {
    const a: TokenRecord = { token_address: 'B', liquidity_sol: 0, price_sol: undefined, sources: ['a'], last_updated: Date.now() }
    const b: TokenRecord = { token_address: 'B', liquidity_sol: 2, price_sol: 3, sources: ['b'], last_updated: Date.now() }
    const merged = mergeTokenRecords(a, b)
    expect(merged.price_sol).toBe(3)
  })
})
