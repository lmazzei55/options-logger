import { describe, it, expect } from 'vitest';
import {
  detectStockWashSales,
  detectWashSales,
  validateClosingTransaction,
  calculateRealizedPL
} from '../positionCalculations';
import type { StockTransaction, OptionTransaction, OptionPosition } from '../../types';

// ── Helpers ──────────────────────────────────────────────────────

const makeStockTxn = (overrides: Partial<StockTransaction> & { id: string; ticker: string; date: string }): StockTransaction => ({
  accountId: 'a1',
  action: 'buy',
  shares: 10,
  pricePerShare: 100,
  totalAmount: 1000,
  fees: 0,
  ...overrides
});

const makeOptionTxn = (overrides: Partial<OptionTransaction> & { id: string; ticker: string; transactionDate: string }): OptionTransaction => ({
  accountId: 'a1',
  strategy: 'cash-secured-put',
  optionType: 'put',
  action: 'sell-to-open',
  contracts: 1,
  strikePrice: 100,
  premiumPerShare: 2,
  totalPremium: 200,
  fees: 0,
  expirationDate: '2026-06-20',
  status: 'open',
  ...overrides
});

// ── detectStockWashSales ─────────────────────────────────────────

describe('detectStockWashSales', () => {
  it('returns null for non-existent transaction', () => {
    expect(detectStockWashSales([], 'missing')).toBeNull();
  });

  it('returns null for dividend transactions', () => {
    const txns = [makeStockTxn({ id: '1', ticker: 'AAPL', date: '2025-06-01', action: 'dividend' })];
    expect(detectStockWashSales(txns, '1')).toBeNull();
  });

  it('detects wash sale when buying after selling at a loss within 30 days', () => {
    const txns = [
      makeStockTxn({ id: '1', ticker: 'AAPL', date: '2025-01-01', action: 'buy', shares: 10, pricePerShare: 100 }),
      makeStockTxn({ id: '2', ticker: 'AAPL', date: '2025-02-01', action: 'sell', shares: 10, pricePerShare: 80 }),
      makeStockTxn({ id: '3', ticker: 'AAPL', date: '2025-02-15', action: 'buy', shares: 10, pricePerShare: 85 })
    ];
    const result = detectStockWashSales(txns, '3');
    expect(result).not.toBeNull();
    expect(result!.hasWashSale).toBe(true);
    expect(result!.relatedTransactionIds).toContain('2');
  });

  it('no wash sale when buy is more than 30 days after loss', () => {
    const txns = [
      makeStockTxn({ id: '1', ticker: 'AAPL', date: '2025-01-01', action: 'buy', shares: 10, pricePerShare: 100 }),
      makeStockTxn({ id: '2', ticker: 'AAPL', date: '2025-02-01', action: 'sell', shares: 10, pricePerShare: 80 }),
      makeStockTxn({ id: '3', ticker: 'AAPL', date: '2025-04-01', action: 'buy', shares: 10, pricePerShare: 85 })
    ];
    expect(detectStockWashSales(txns, '3')).toBeNull();
  });

  it('detects wash sale when selling at a loss with nearby buys', () => {
    const txns = [
      makeStockTxn({ id: '1', ticker: 'AAPL', date: '2025-01-01', action: 'buy', shares: 10, pricePerShare: 100 }),
      makeStockTxn({ id: '2', ticker: 'AAPL', date: '2025-01-25', action: 'buy', shares: 5, pricePerShare: 90 }),
      makeStockTxn({ id: '3', ticker: 'AAPL', date: '2025-02-01', action: 'sell', shares: 10, pricePerShare: 80 })
    ];
    const result = detectStockWashSales(txns, '3');
    expect(result).not.toBeNull();
    expect(result!.hasWashSale).toBe(true);
    expect(result!.lossAmount).toBeGreaterThan(0);
  });

  it('no wash sale on profitable sell', () => {
    const txns = [
      makeStockTxn({ id: '1', ticker: 'AAPL', date: '2025-01-01', action: 'buy', shares: 10, pricePerShare: 100 }),
      makeStockTxn({ id: '2', ticker: 'AAPL', date: '2025-01-25', action: 'buy', shares: 5, pricePerShare: 110 }),
      makeStockTxn({ id: '3', ticker: 'AAPL', date: '2025-02-01', action: 'sell', shares: 10, pricePerShare: 120 })
    ];
    expect(detectStockWashSales(txns, '3')).toBeNull();
  });

  it('ignores different tickers', () => {
    const txns = [
      makeStockTxn({ id: '1', ticker: 'AAPL', date: '2025-01-01', action: 'buy', shares: 10, pricePerShare: 100 }),
      makeStockTxn({ id: '2', ticker: 'AAPL', date: '2025-02-01', action: 'sell', shares: 10, pricePerShare: 80 }),
      makeStockTxn({ id: '3', ticker: 'MSFT', date: '2025-02-15', action: 'buy', shares: 10, pricePerShare: 85 })
    ];
    expect(detectStockWashSales(txns, '3')).toBeNull();
  });
});

// ── detectWashSales (options) ────────────────────────────────────

describe('detectWashSales (options)', () => {
  it('returns null for opening transactions', () => {
    const txns = [makeOptionTxn({ id: '1', ticker: 'AAPL', transactionDate: '2025-01-01', action: 'sell-to-open' })];
    expect(detectWashSales(txns, '1')).toBeNull();
  });

  it('returns null when closing at a profit', () => {
    const txns = [
      makeOptionTxn({ id: '1', ticker: 'AAPL', transactionDate: '2025-01-01', action: 'buy-to-close', status: 'closed', realizedPL: 100 })
    ];
    expect(detectWashSales(txns, '1')).toBeNull();
  });

  it('detects wash sale on option closed at a loss with nearby open', () => {
    const txns = [
      makeOptionTxn({ id: '1', ticker: 'AAPL', transactionDate: '2025-01-01', action: 'sell-to-open', optionType: 'put' }),
      makeOptionTxn({ id: '2', ticker: 'AAPL', transactionDate: '2025-01-20', action: 'buy-to-close', optionType: 'put', status: 'closed', realizedPL: -100 })
    ];
    const result = detectWashSales(txns, '2');
    expect(result).not.toBeNull();
    expect(result!.hasWashSale).toBe(true);
    expect(result!.lossAmount).toBe(100);
  });
});

// ── validateClosingTransaction ───────────────────────────────────

describe('validateClosingTransaction', () => {
  const openPositions: OptionPosition[] = [{
    id: 'p1', ticker: 'AAPL', accountId: 'a1', strategy: 'cash-secured-put', optionType: 'put',
    contracts: 3, strikePrice: 100, expirationDate: '2026-06-20', averagePremium: 2, totalPremium: 600,
    status: 'open', transactionIds: ['1'], openDate: '2025-01-01'
  }];

  it('passes for non-closing transactions', () => {
    const txn = makeOptionTxn({ id: '2', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'sell-to-open' });
    expect(validateClosingTransaction(txn, openPositions).valid).toBe(true);
  });

  it('fails when no matching position exists', () => {
    const txn = makeOptionTxn({ id: '2', ticker: 'MSFT', transactionDate: '2025-02-01', action: 'buy-to-close', contracts: 1 });
    const result = validateClosingTransaction(txn, openPositions);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('No open position found');
  });

  it('fails when trying to close more contracts than open', () => {
    const txn = makeOptionTxn({ id: '2', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'buy-to-close', contracts: 5 });
    const result = validateClosingTransaction(txn, openPositions);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Only 3 contracts are open');
  });

  it('passes for valid partial close', () => {
    const txn = makeOptionTxn({ id: '2', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'buy-to-close', contracts: 2 });
    expect(validateClosingTransaction(txn, openPositions).valid).toBe(true);
  });
});

// ── calculateRealizedPL ──────────────────────────────────────────

describe('calculateRealizedPL', () => {
  it('calculates P&L for sell-to-open then buy-to-close (profit)', () => {
    const open = makeOptionTxn({ id: '1', ticker: 'AAPL', transactionDate: '2025-01-01', action: 'sell-to-open', totalPremium: 200, fees: 5 });
    const close = makeOptionTxn({ id: '2', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'buy-to-close', totalPremium: 50, fees: 5 });
    expect(calculateRealizedPL(open, close)).toBe(140); // 200 - 50 - 5 - 5
  });

  it('calculates P&L for buy-to-open then sell-to-close (profit)', () => {
    const open = makeOptionTxn({ id: '1', ticker: 'AAPL', transactionDate: '2025-01-01', action: 'buy-to-open', totalPremium: 100, fees: 5 });
    const close = makeOptionTxn({ id: '2', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'sell-to-close', totalPremium: 200, fees: 5 });
    expect(calculateRealizedPL(open, close)).toBe(90); // 200 - 100 - 5 - 5
  });

  it('calculates P&L for a losing trade', () => {
    const open = makeOptionTxn({ id: '1', ticker: 'AAPL', transactionDate: '2025-01-01', action: 'sell-to-open', totalPremium: 200, fees: 0 });
    const close = makeOptionTxn({ id: '2', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'buy-to-close', totalPremium: 300, fees: 0 });
    expect(calculateRealizedPL(open, close)).toBe(-100);
  });
});
