import { describe, it, expect } from 'vitest';
import { planOptionClose, checkOptionWashSale } from '../optionClosing';
import type { OptionTransaction } from '../../types';

const makeOptionTxn = (overrides: Partial<OptionTransaction> & { id: string }): OptionTransaction => ({
  accountId: 'a1',
  ticker: 'AAPL',
  strategy: 'cash-secured-put',
  optionType: 'put',
  action: 'sell-to-open',
  contracts: 1,
  strikePrice: 100,
  premiumPerShare: 2,
  totalPremium: 200,
  fees: 0,
  expirationDate: '2026-06-20',
  transactionDate: '2025-01-01',
  status: 'open',
  ...overrides
});

describe('planOptionClose', () => {
  it('returns null for non-existent position', () => {
    expect(planOptionClose({ positionId: 'nope', closeType: 'expired' }, [])).toBeNull();
  });

  it('plans expiration for a sell-to-open position (seller keeps premium)', () => {
    const txns = [makeOptionTxn({ id: 'o1', totalPremium: 200, fees: 10 })];
    const result = planOptionClose({ positionId: 'o1', closeType: 'expired' }, txns);
    expect(result).not.toBeNull();
    expect(result!.realizedPL).toBe(190); // 200 premium - 10 fees
    expect(result!.closingOptionTxn.action).toBe('buy-to-close');
    expect(result!.closingOptionTxn.totalPremium).toBe(0);
    expect(result!.closingOptionTxn.status).toBe('expired');
    expect(result!.stockTxn).toBeUndefined();
  });

  it('plans expiration for a buy-to-open position (buyer loses premium)', () => {
    const txns = [makeOptionTxn({ id: 'o1', action: 'buy-to-open', totalPremium: 200, fees: 10 })];
    const result = planOptionClose({ positionId: 'o1', closeType: 'expired' }, txns);
    expect(result!.realizedPL).toBe(-210); // -(200 + 10)
    expect(result!.closingOptionTxn.action).toBe('sell-to-close');
  });

  it('plans manual close for seller', () => {
    const txns = [makeOptionTxn({ id: 'o1', totalPremium: 200, fees: 5 })];
    const result = planOptionClose({ positionId: 'o1', closeType: 'closed', closePrice: 1, fees: 5 }, txns);
    // P&L = 200 (open premium) - 100 (close: 1 * 1 * 100) - 5 (open fees) - 5 (close fees)
    expect(result!.realizedPL).toBe(90);
    expect(result!.closingOptionTxn.totalPremium).toBe(100);
  });

  it('plans manual close for buyer', () => {
    const txns = [makeOptionTxn({ id: 'o1', action: 'buy-to-open', totalPremium: 100, fees: 0 })];
    const result = planOptionClose({ positionId: 'o1', closeType: 'closed', closePrice: 3, fees: 0 }, txns);
    // P&L = 300 (close proceeds) - 100 (open cost) = 200
    expect(result!.realizedPL).toBe(200);
  });

  it('plans put assignment (CSP) — creates stock buy', () => {
    const txns = [makeOptionTxn({ id: 'o1', optionType: 'put', strategy: 'cash-secured-put', strikePrice: 50, totalPremium: 200, fees: 0 })];
    const result = planOptionClose({ positionId: 'o1', closeType: 'assigned' }, txns);
    expect(result!.stockTxn).toBeDefined();
    expect(result!.stockTxn!.action).toBe('buy');
    expect(result!.stockTxn!.shares).toBe(100);
    expect(result!.stockTxn!.pricePerShare).toBe(50);
  });

  it('plans call assignment (covered call) — creates stock sell', () => {
    const txns = [makeOptionTxn({ id: 'o1', optionType: 'call', strategy: 'covered-call', strikePrice: 150, totalPremium: 300, fees: 0 })];
    const result = planOptionClose({ positionId: 'o1', closeType: 'assigned' }, txns);
    expect(result!.stockTxn).toBeDefined();
    expect(result!.stockTxn!.action).toBe('sell');
    expect(result!.stockTxn!.shares).toBe(100);
    expect(result!.stockTxn!.pricePerShare).toBe(150);
  });

  it('handles partial close', () => {
    const txns = [makeOptionTxn({ id: 'o1', contracts: 3, totalPremium: 600, fees: 0 })];
    const result = planOptionClose({ positionId: 'o1', closeType: 'closed', closePrice: 1, contractsToClose: 1, fees: 0 }, txns);
    // Proportional: 1/3 of 600 = 200 open premium. Close = 1*1*100 = 100. P&L = 200 - 100 = 100
    expect(result!.closingOptionTxn.contracts).toBe(1);
    expect(result!.realizedPL).toBe(100);
  });

  it('rejects closing more contracts than available', () => {
    const txns = [makeOptionTxn({ id: 'o1', contracts: 1 })];
    expect(planOptionClose({ positionId: 'o1', closeType: 'closed', contractsToClose: 5 }, txns)).toBeNull();
  });
});

describe('checkOptionWashSale', () => {
  it('returns no wash sale for profitable close', () => {
    const result = checkOptionWashSale('close1', {} as any, [], 100);
    expect(result.hasWashSale).toBe(false);
  });

  it('detects wash sale when closing at a loss with nearby open', () => {
    const existingTxns = [
      makeOptionTxn({ id: 'o1', transactionDate: '2025-01-15', action: 'sell-to-open', optionType: 'put' })
    ];
    const closingTxn: Omit<OptionTransaction, 'id'> = {
      accountId: 'a1', ticker: 'AAPL', strategy: 'cash-secured-put', optionType: 'put',
      action: 'buy-to-close', contracts: 1, strikePrice: 100, premiumPerShare: 3,
      totalPremium: 300, fees: 0, expirationDate: '2026-06-20', transactionDate: '2025-02-01',
      status: 'closed', realizedPL: -100
    };
    const result = checkOptionWashSale('close1', closingTxn, existingTxns, -100);
    expect(result.hasWashSale).toBe(true);
    expect(result.lossAmount).toBe(100);
  });
});
