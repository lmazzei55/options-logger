import { describe, it, expect } from 'vitest';
import {
  calculateStockPositions,
  calculateOptionPositions,
  calculatePortfolioSummary,
  calculateOptionsAnalytics,
  calculateStockAnalytics,
  formatCurrency,
  formatPercentage,
  calculateAnnualizedReturn
} from '../calculations';
import type {
  StockTransaction,
  OptionTransaction,
  InvestmentAccount,
  StockPosition,
  OptionPosition
} from '../../types';

// ── Helpers ──────────────────────────────────────────────────────

const makeStockTxn = (overrides: Partial<StockTransaction> & { id: string; accountId: string; ticker: string; date: string }): StockTransaction => ({
  action: 'buy',
  shares: 10,
  pricePerShare: 100,
  totalAmount: 1000,
  fees: 0,
  ...overrides
});

const makeOptionTxn = (overrides: Partial<OptionTransaction> & { id: string; accountId: string; ticker: string; transactionDate: string }): OptionTransaction => ({
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

const makeAccount = (overrides: Partial<InvestmentAccount> & { id: string }): InvestmentAccount => ({
  name: 'Test Account',
  type: 'brokerage',
  broker: 'Test',
  initialCash: 10000,
  currentCash: 10000,
  currency: 'USD',
  isActive: true,
  createdDate: '2025-01-01',
  ...overrides
});

// ── calculateStockPositions ──────────────────────────────────────

describe('calculateStockPositions', () => {
  it('returns empty for no transactions', () => {
    expect(calculateStockPositions([])).toEqual([]);
  });

  it('creates a position from a single buy', () => {
    const txns = [makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-06-01', shares: 10, pricePerShare: 150, totalAmount: 1500 })];
    const positions = calculateStockPositions(txns);
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe('AAPL');
    expect(positions[0].shares).toBe(10);
    expect(positions[0].averageCostBasis).toBe(150);
    expect(positions[0].totalCostBasis).toBe(1500);
  });

  it('handles multiple buys with FIFO averaging', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', date: '2025-02-01', shares: 10, pricePerShare: 200, totalAmount: 2000 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions).toHaveLength(1);
    expect(positions[0].shares).toBe(20);
    expect(positions[0].totalCostBasis).toBe(3000);
    expect(positions[0].averageCostBasis).toBe(150);
  });

  it('consumes lots FIFO on sell', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', date: '2025-02-01', shares: 10, pricePerShare: 200, totalAmount: 2000 }),
      makeStockTxn({ id: '3', accountId: 'a1', ticker: 'AAPL', date: '2025-03-01', action: 'sell', shares: 10, pricePerShare: 250, totalAmount: 2500 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions).toHaveLength(1);
    // After selling 10 shares FIFO, the $100 lot is consumed, leaving 10 shares @ $200
    expect(positions[0].shares).toBe(10);
    expect(positions[0].averageCostBasis).toBe(200);
    expect(positions[0].totalCostBasis).toBe(2000);
  });

  it('partial sell consumes part of a lot', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', date: '2025-03-01', action: 'sell', shares: 5, pricePerShare: 150, totalAmount: 750 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions[0].shares).toBe(5);
    expect(positions[0].averageCostBasis).toBe(100); // remaining lot is all @100
  });

  it('removes position when fully sold', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', date: '2025-03-01', action: 'sell', shares: 10, pricePerShare: 150, totalAmount: 1500 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions).toHaveLength(0);
  });

  it('handles stock split', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 200, totalAmount: 2000 }),
      makeStockTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', date: '2025-06-01', action: 'split', shares: 0, pricePerShare: 0, totalAmount: 0, splitRatio: '2:1' })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions[0].shares).toBe(20);
    expect(positions[0].averageCostBasis).toBe(100); // price halved
    expect(positions[0].totalCostBasis).toBe(2000);  // total unchanged
  });

  it('handles transfer-in like a buy', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', action: 'transfer-in', shares: 10, pricePerShare: 100, totalAmount: 1000 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions[0].shares).toBe(10);
  });

  it('handles transfer-out like a sell', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', date: '2025-02-01', action: 'transfer-out', shares: 10, pricePerShare: 100, totalAmount: 1000 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions).toHaveLength(0);
  });

  it('filters by accountId when provided', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a2', ticker: 'AAPL', date: '2025-01-01', shares: 5, pricePerShare: 100, totalAmount: 500 })
    ];
    const positions = calculateStockPositions(txns, 'a1');
    expect(positions).toHaveLength(1);
    expect(positions[0].shares).toBe(10);
  });

  it('tracks separate positions per account', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a2', ticker: 'AAPL', date: '2025-01-01', shares: 5, pricePerShare: 200, totalAmount: 1000 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions).toHaveLength(2);
  });

  it('correctly parses ticker when accountId is a UUID', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const txns = [
      makeStockTxn({ id: '1', accountId: uuid, ticker: 'SPY', date: '2025-01-01', shares: 100, pricePerShare: 450, totalAmount: 45000 })
    ];
    const positions = calculateStockPositions(txns);
    expect(positions).toHaveLength(1);
    expect(positions[0].ticker).toBe('SPY');
    expect(positions[0].accountId).toBe(uuid);
  });
});

// ── calculateOptionPositions ─────────────────────────────────────

describe('calculateOptionPositions', () => {
  it('returns empty for no transactions', () => {
    expect(calculateOptionPositions([])).toEqual([]);
  });

  it('creates position from sell-to-open', () => {
    const txns = [makeOptionTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-01-01' })];
    const positions = calculateOptionPositions(txns);
    expect(positions).toHaveLength(1);
    expect(positions[0].contracts).toBe(1);
    expect(positions[0].totalPremium).toBe(200);
  });

  it('aggregates multiple opens into one position', () => {
    const txns = [
      makeOptionTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-01-01', contracts: 1, totalPremium: 200 }),
      makeOptionTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-01-15', contracts: 2, totalPremium: 500 })
    ];
    const positions = calculateOptionPositions(txns);
    expect(positions).toHaveLength(1);
    expect(positions[0].contracts).toBe(3);
    expect(positions[0].totalPremium).toBe(700);
  });

  it('reduces contracts on buy-to-close', () => {
    const txns = [
      makeOptionTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-01-01', contracts: 3, totalPremium: 600 }),
      makeOptionTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'buy-to-close', contracts: 1, totalPremium: 100, status: 'closed' })
    ];
    const positions = calculateOptionPositions(txns);
    expect(positions).toHaveLength(1);
    expect(positions[0].contracts).toBe(2);
  });

  it('marks fully closed position', () => {
    const txns = [
      makeOptionTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-01-01', contracts: 1, totalPremium: 200 }),
      makeOptionTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-02-01', action: 'buy-to-close', contracts: 1, totalPremium: 50, status: 'closed', realizedPL: 150, closeDate: '2025-02-01' })
    ];
    const positions = calculateOptionPositions(txns);
    // Fully closed positions with status 'closed' are filtered out
    const open = positions.filter(p => p.contracts > 0);
    expect(open).toHaveLength(0);
  });
});

// ── calculatePortfolioSummary ────────────────────────────────────

describe('calculatePortfolioSummary', () => {
  it('returns zeroes for empty inputs', () => {
    const summary = calculatePortfolioSummary([], [], []);
    expect(summary.totalValue).toBe(0);
    expect(summary.totalCash).toBe(0);
    expect(summary.totalPL).toBe(0);
  });

  it('calculates correctly with one account and positions', () => {
    const accounts = [makeAccount({ id: 'a1', initialCash: 10000, currentCash: 8500 })];
    const stockPositions: StockPosition[] = [{
      ticker: 'AAPL', accountId: 'a1', shares: 10, averageCostBasis: 150,
      totalCostBasis: 1500, firstPurchaseDate: '2025-01-01', lastTransactionDate: '2025-01-01', transactionIds: ['1']
    }];
    const optionPositions: OptionPosition[] = [{
      id: 'o1', ticker: 'AAPL', accountId: 'a1', strategy: 'cash-secured-put', optionType: 'put',
      contracts: 1, strikePrice: 140, expirationDate: '2026-06-20', averagePremium: 2, totalPremium: 200,
      status: 'open', collateralRequired: 14000, transactionIds: ['2'], openDate: '2025-01-01'
    }];
    const summary = calculatePortfolioSummary(accounts, stockPositions, optionPositions);
    expect(summary.totalCash).toBe(8500);
    expect(summary.activeCollateral).toBe(14000);
    expect(summary.stockValue).toBe(1500); // no market price, uses cost basis
    expect(summary.totalValue).toBe(8500 + 1500);
  });

  it('filters by accountId', () => {
    const accounts = [
      makeAccount({ id: 'a1', currentCash: 5000, initialCash: 5000 }),
      makeAccount({ id: 'a2', currentCash: 3000, initialCash: 3000 })
    ];
    const summary = calculatePortfolioSummary(accounts, [], [], 'a1');
    expect(summary.totalCash).toBe(5000);
  });
});

// ── calculateOptionsAnalytics ────────────────────────────────────

describe('calculateOptionsAnalytics', () => {
  it('calculates premium collected/paid', () => {
    const txns = [
      makeOptionTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-01-01', action: 'sell-to-open', totalPremium: 200 }),
      makeOptionTxn({ id: '2', accountId: 'a1', ticker: 'MSFT', transactionDate: '2025-01-01', action: 'buy-to-open', totalPremium: 100 })
    ];
    const analytics = calculateOptionsAnalytics(txns, []);
    expect(analytics.totalPremiumCollected).toBe(200);
    expect(analytics.totalPremiumPaid).toBe(100);
    expect(analytics.netPremium).toBe(100);
  });

  it('calculates win rate from closed positions', () => {
    const txns = [
      makeOptionTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', transactionDate: '2025-01-01', status: 'expired', realizedPL: 200, closeDate: '2025-03-01' }),
      makeOptionTxn({ id: '2', accountId: 'a1', ticker: 'MSFT', transactionDate: '2025-01-01', status: 'closed', realizedPL: -50, closeDate: '2025-02-01' }),
      makeOptionTxn({ id: '3', accountId: 'a1', ticker: 'GOOG', transactionDate: '2025-01-01', status: 'closed', realizedPL: 100, closeDate: '2025-02-15' })
    ];
    const analytics = calculateOptionsAnalytics(txns, []);
    expect(analytics.winRate).toBeCloseTo(66.67, 1); // 2 out of 3
  });
});

// ── calculateStockAnalytics ──────────────────────────────────────

describe('calculateStockAnalytics', () => {
  it('calculates realized PL using FIFO', () => {
    const txns = [
      makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01', shares: 10, pricePerShare: 100, totalAmount: 1000 }),
      makeStockTxn({ id: '2', accountId: 'a1', ticker: 'AAPL', date: '2025-03-01', action: 'sell', shares: 10, pricePerShare: 150, totalAmount: 1500, fees: 5 })
    ];
    const positions = calculateStockPositions(txns);
    const analytics = calculateStockAnalytics(txns, positions);
    // Realized P&L = (150 - 100) * 10 - 5 fees = 495
    expect(analytics.totalRealizedPL).toBe(495);
  });

  it('returns zero realized PL when no sells', () => {
    const txns = [makeStockTxn({ id: '1', accountId: 'a1', ticker: 'AAPL', date: '2025-01-01' })];
    const positions = calculateStockPositions(txns);
    const analytics = calculateStockAnalytics(txns, positions);
    expect(analytics.totalRealizedPL).toBe(0);
  });
});

// ── Formatting helpers ───────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats positive amounts', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });
  it('formats negative amounts', () => {
    expect(formatCurrency(-500)).toBe('-$500.00');
  });
  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });
});

describe('formatPercentage', () => {
  it('formats positive with + prefix', () => {
    expect(formatPercentage(12.345)).toBe('+12.35%');
  });
  it('formats negative without + prefix', () => {
    expect(formatPercentage(-5.1)).toBe('-5.10%');
  });
});

describe('calculateAnnualizedReturn', () => {
  it('returns 0 for zero collateral', () => {
    expect(calculateAnnualizedReturn(100, 0, 30)).toBe(0);
  });
  it('returns 0 for zero days', () => {
    expect(calculateAnnualizedReturn(100, 5000, 0)).toBe(0);
  });
  it('calculates correctly', () => {
    // $200 premium on $10000 collateral over 30 days
    const result = calculateAnnualizedReturn(200, 10000, 30);
    // (200/10000) * (365/30) * 100 = 24.33%
    expect(result).toBeCloseTo(24.33, 1);
  });
});
