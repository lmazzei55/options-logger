import { describe, it, expect } from 'vitest';
import {
  validateStockTransaction,
  validateOptionTransaction,
  generateStockTransactionFingerprint,
  generateOptionTransactionFingerprint,
  findDuplicateStockTransactions,
  findDuplicateOptionTransactions
} from '../validation';
import type { StockTransaction, OptionTransaction, InvestmentAccount } from '../../types';

const accounts: InvestmentAccount[] = [{
  id: 'a1', name: 'Test', type: 'brokerage', broker: 'Test',
  initialCash: 10000, currentCash: 10000, currency: 'USD', isActive: true, createdDate: '2025-01-01'
}];

const validStockTxn: Omit<StockTransaction, 'id'> = {
  accountId: 'a1', ticker: 'AAPL', action: 'buy', shares: 10,
  pricePerShare: 150, totalAmount: 1500, fees: 5, date: '2025-06-01'
};

const validOptionTxn: Omit<OptionTransaction, 'id'> = {
  accountId: 'a1', ticker: 'AAPL', strategy: 'cash-secured-put', optionType: 'put',
  action: 'sell-to-open', contracts: 1, strikePrice: 150, premiumPerShare: 2,
  totalPremium: 200, fees: 5, expirationDate: '2026-06-20', transactionDate: '2025-06-01', status: 'open'
};

// ── validateStockTransaction ─────────────────────────────────────

describe('validateStockTransaction', () => {
  it('passes for valid transaction', () => {
    const result = validateStockTransaction(validStockTxn, accounts);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for missing account', () => {
    const result = validateStockTransaction({ ...validStockTxn, accountId: 'missing' }, accounts);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'accountId')).toBe(true);
  });

  it('fails for empty ticker', () => {
    const result = validateStockTransaction({ ...validStockTxn, ticker: '' }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for invalid ticker format', () => {
    const result = validateStockTransaction({ ...validStockTxn, ticker: 'aapl' }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('allows dot-separated tickers like BRK.B', () => {
    const result = validateStockTransaction({ ...validStockTxn, ticker: 'BRK.B' }, accounts);
    expect(result.isValid).toBe(true);
  });

  it('fails for zero shares', () => {
    const result = validateStockTransaction({ ...validStockTxn, shares: 0 }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for negative price', () => {
    const result = validateStockTransaction({ ...validStockTxn, pricePerShare: -1 }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for negative fees', () => {
    const result = validateStockTransaction({ ...validStockTxn, fees: -1 }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for invalid date', () => {
    const result = validateStockTransaction({ ...validStockTxn, date: 'not-a-date' }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for future date', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const result = validateStockTransaction({ ...validStockTxn, date: future.toISOString() }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('warns for unusually high price', () => {
    const result = validateStockTransaction({ ...validStockTxn, pricePerShare: 15000 }, accounts);
    expect(result.isValid).toBe(true); // still valid
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('validates split ratio format', () => {
    const result = validateStockTransaction({ ...validStockTxn, action: 'split', splitRatio: 'invalid' }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('passes valid split ratio', () => {
    const result = validateStockTransaction({ ...validStockTxn, action: 'split', splitRatio: '2:1' }, accounts);
    expect(result.isValid).toBe(true);
  });
});

// ── validateOptionTransaction ────────────────────────────────────

describe('validateOptionTransaction', () => {
  it('passes for valid transaction', () => {
    const result = validateOptionTransaction(validOptionTxn, accounts);
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails for missing account', () => {
    const result = validateOptionTransaction({ ...validOptionTxn, accountId: 'missing' }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for zero contracts', () => {
    const result = validateOptionTransaction({ ...validOptionTxn, contracts: 0 }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for zero strike price', () => {
    const result = validateOptionTransaction({ ...validOptionTxn, strikePrice: 0 }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails for negative premium', () => {
    const result = validateOptionTransaction({ ...validOptionTxn, premiumPerShare: -1 }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('fails when expiration is before transaction date', () => {
    const result = validateOptionTransaction({ ...validOptionTxn, expirationDate: '2024-01-01' }, accounts);
    expect(result.isValid).toBe(false);
  });

  it('warns when premium exceeds strike price', () => {
    const result = validateOptionTransaction({ ...validOptionTxn, premiumPerShare: 200 }, accounts);
    expect(result.isValid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ── Fingerprinting & Deduplication ───────────────────────────────

describe('fingerprinting', () => {
  it('generates consistent stock fingerprints', () => {
    const fp1 = generateStockTransactionFingerprint(validStockTxn);
    const fp2 = generateStockTransactionFingerprint(validStockTxn);
    expect(fp1).toBe(fp2);
  });

  it('generates consistent option fingerprints', () => {
    const fp1 = generateOptionTransactionFingerprint(validOptionTxn);
    const fp2 = generateOptionTransactionFingerprint(validOptionTxn);
    expect(fp1).toBe(fp2);
  });

  it('rounds prices in fingerprints', () => {
    const fp1 = generateStockTransactionFingerprint({ ...validStockTxn, pricePerShare: 100.001 });
    const fp2 = generateStockTransactionFingerprint({ ...validStockTxn, pricePerShare: 100.004 });
    expect(fp1).toBe(fp2); // both round to 100.00
  });
});

describe('duplicate detection', () => {
  it('finds exact stock duplicates', () => {
    const existing: StockTransaction[] = [{ ...validStockTxn, id: 'existing-1' }];
    const dupes = findDuplicateStockTransactions(validStockTxn, existing);
    expect(dupes).toHaveLength(1);
  });

  it('returns empty when no duplicates', () => {
    const existing: StockTransaction[] = [{ ...validStockTxn, id: 'existing-1', ticker: 'MSFT' }];
    const dupes = findDuplicateStockTransactions(validStockTxn, existing);
    expect(dupes).toHaveLength(0);
  });

  it('finds exact option duplicates', () => {
    const existing: OptionTransaction[] = [{ ...validOptionTxn, id: 'existing-1' }];
    const dupes = findDuplicateOptionTransactions(validOptionTxn, existing);
    expect(dupes).toHaveLength(1);
  });
});

// ── migrations.ts ────────────────────────────────────────────────

describe('migrations (basic)', () => {
  // Import here to co-locate with other util tests
  it('applies schema version to data without one', async () => {
    const { applyMigrations, CURRENT_SCHEMA_VERSION } = await import('../migrations');
    const data = { accounts: [], stockTransactions: [] };
    const result = applyMigrations(data);
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('does not re-apply to current version', async () => {
    const { applyMigrations, CURRENT_SCHEMA_VERSION } = await import('../migrations');
    const data = { schemaVersion: CURRENT_SCHEMA_VERSION, accounts: [{ id: '1' }] };
    const result = applyMigrations(data);
    expect(result.accounts).toEqual([{ id: '1' }]);
  });
});
