import { describe, it, expect } from 'vitest';
import { accountReducer } from '../useAccountState';
import { stockTransactionReducer, getStockCashChange } from '../useStockTransactionState';
import { optionTransactionReducer, getOptionCashChange } from '../useOptionTransactionState';
import { settingsReducer, tagReducer, templateReducer, defaultSettings } from '../useSettingsState';
import type { InvestmentAccount, StockTransaction, OptionTransaction, Tag, TransactionTemplate } from '../../types';

// ==========================================
// Account Reducer
// ==========================================

describe('accountReducer', () => {
  const baseAccount: InvestmentAccount = {
    id: 'acc-1',
    name: 'Test Account',
    type: 'brokerage',
    broker: 'Test',
    initialCash: 10000,
    currentCash: 10000,
    currency: 'USD',
    isActive: true,
    createdDate: '2026-01-01'
  };

  it('should add an account with generated id', () => {
    const { id: _, ...accountWithoutId } = baseAccount;
    const result = accountReducer([], { type: 'ADD', account: accountWithoutId });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Test Account');
    expect(result[0].id).toBeDefined();
  });

  it('should update an account', () => {
    const result = accountReducer([baseAccount], { type: 'UPDATE', id: 'acc-1', updates: { name: 'Updated' } });
    expect(result[0].name).toBe('Updated');
    expect(result[0].broker).toBe('Test');
  });

  it('should not update non-existent account', () => {
    const result = accountReducer([baseAccount], { type: 'UPDATE', id: 'nonexistent', updates: { name: 'X' } });
    expect(result[0].name).toBe('Test Account');
  });

  it('should delete an account', () => {
    const result = accountReducer([baseAccount], { type: 'DELETE', id: 'acc-1' });
    expect(result).toHaveLength(0);
  });

  it('should update cash balance', () => {
    const result = accountReducer([baseAccount], { type: 'UPDATE_CASH', accountId: 'acc-1', cashChange: -500 });
    expect(result[0].currentCash).toBe(9500);
  });

  it('should only update cash for matching account', () => {
    const accounts = [baseAccount, { ...baseAccount, id: 'acc-2', currentCash: 5000 }];
    const result = accountReducer(accounts, { type: 'UPDATE_CASH', accountId: 'acc-1', cashChange: 100 });
    expect(result[0].currentCash).toBe(10100);
    expect(result[1].currentCash).toBe(5000);
  });

  it('should set all accounts', () => {
    const newAccounts = [{ ...baseAccount, id: 'new-1' }];
    const result = accountReducer([baseAccount], { type: 'SET_ALL', accounts: newAccounts });
    expect(result).toEqual(newAccounts);
  });
});

// ==========================================
// Stock Transaction Reducer
// ==========================================

describe('stockTransactionReducer', () => {
  const baseTxn: StockTransaction = {
    id: 'stk-1',
    accountId: 'acc-1',
    ticker: 'AAPL',
    action: 'buy',
    shares: 100,
    pricePerShare: 150,
    totalAmount: 15000,
    fees: 5,
    date: '2026-01-15'
  };

  it('should add a transaction', () => {
    const result = stockTransactionReducer([], { type: 'ADD', transaction: baseTxn });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(baseTxn);
  });

  it('should update a transaction', () => {
    const result = stockTransactionReducer([baseTxn], { type: 'UPDATE', id: 'stk-1', updates: { shares: 200 } });
    expect(result[0].shares).toBe(200);
    expect(result[0].ticker).toBe('AAPL');
  });

  it('should delete a transaction', () => {
    const result = stockTransactionReducer([baseTxn], { type: 'DELETE', id: 'stk-1' });
    expect(result).toHaveLength(0);
  });

  it('should delete by account', () => {
    const txns = [baseTxn, { ...baseTxn, id: 'stk-2', accountId: 'acc-2' }];
    const result = stockTransactionReducer(txns, { type: 'DELETE_BY_ACCOUNT', accountId: 'acc-1' });
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe('acc-2');
  });

  it('should set all transactions', () => {
    const newTxns = [{ ...baseTxn, id: 'new-1' }];
    const result = stockTransactionReducer([baseTxn], { type: 'SET_ALL', transactions: newTxns });
    expect(result).toEqual(newTxns);
  });
});

describe('getStockCashChange', () => {
  const makeTxn = (action: StockTransaction['action'], totalAmount = 1000, fees = 5): StockTransaction => ({
    id: '1', accountId: 'a', ticker: 'X', action, shares: 10, pricePerShare: 100, totalAmount, fees, date: '2026-01-01'
  });

  it('buy should be negative (cost + fees)', () => {
    expect(getStockCashChange(makeTxn('buy'))).toBe(-1005);
  });

  it('sell should be positive (proceeds - fees)', () => {
    expect(getStockCashChange(makeTxn('sell'))).toBe(995);
  });

  it('dividend should be positive (amount)', () => {
    expect(getStockCashChange(makeTxn('dividend'))).toBe(1000);
  });

  it('split should have no cash impact', () => {
    expect(getStockCashChange(makeTxn('split'))).toBe(0);
  });

  it('transfer should have no cash impact', () => {
    expect(getStockCashChange(makeTxn('transfer-in'))).toBe(0);
    expect(getStockCashChange(makeTxn('transfer-out'))).toBe(0);
  });
});

// ==========================================
// Option Transaction Reducer
// ==========================================

describe('optionTransactionReducer', () => {
  const baseTxn: OptionTransaction = {
    id: 'opt-1',
    accountId: 'acc-1',
    ticker: 'AAPL',
    strategy: 'cash-secured-put',
    optionType: 'put',
    action: 'sell-to-open',
    contracts: 1,
    strikePrice: 150,
    premiumPerShare: 3,
    totalPremium: 300,
    fees: 5,
    expirationDate: '2026-03-21',
    transactionDate: '2026-01-15',
    status: 'open'
  };

  it('should add a transaction', () => {
    const result = optionTransactionReducer([], { type: 'ADD', transaction: baseTxn });
    expect(result).toHaveLength(1);
  });

  it('should update a transaction', () => {
    const result = optionTransactionReducer([baseTxn], { type: 'UPDATE', id: 'opt-1', updates: { status: 'closed' } });
    expect(result[0].status).toBe('closed');
  });

  it('should delete a transaction', () => {
    const result = optionTransactionReducer([baseTxn], { type: 'DELETE', id: 'opt-1' });
    expect(result).toHaveLength(0);
  });

  it('should delete by account', () => {
    const txns = [baseTxn, { ...baseTxn, id: 'opt-2', accountId: 'acc-2' }];
    const result = optionTransactionReducer(txns, { type: 'DELETE_BY_ACCOUNT', accountId: 'acc-1' });
    expect(result).toHaveLength(1);
    expect(result[0].accountId).toBe('acc-2');
  });
});

describe('getOptionCashChange', () => {
  const makeTxn = (action: OptionTransaction['action']): OptionTransaction => ({
    id: '1', accountId: 'a', ticker: 'X', strategy: 'cash-secured-put', optionType: 'put',
    action, contracts: 1, strikePrice: 100, premiumPerShare: 3, totalPremium: 300,
    fees: 5, expirationDate: '2026-03-21', transactionDate: '2026-01-15', status: 'open'
  });

  it('sell-to-open: receive premium minus fees', () => {
    expect(getOptionCashChange(makeTxn('sell-to-open'))).toBe(295);
  });

  it('buy-to-open: pay premium plus fees', () => {
    expect(getOptionCashChange(makeTxn('buy-to-open'))).toBe(-305);
  });

  it('buy-to-close: pay premium plus fees', () => {
    expect(getOptionCashChange(makeTxn('buy-to-close'))).toBe(-305);
  });

  it('sell-to-close: receive premium minus fees', () => {
    expect(getOptionCashChange(makeTxn('sell-to-close'))).toBe(295);
  });
});

// ==========================================
// Settings Reducer
// ==========================================

describe('settingsReducer', () => {
  it('should update settings partially', () => {
    const result = settingsReducer(defaultSettings, { type: 'UPDATE', updates: { theme: 'dark' } });
    expect(result.theme).toBe('dark');
    expect(result.defaultCurrency).toBe('USD');
  });

  it('should set all settings', () => {
    const newSettings = { ...defaultSettings, theme: 'light' as const };
    const result = settingsReducer(defaultSettings, { type: 'SET_ALL', settings: newSettings });
    expect(result.theme).toBe('light');
  });
});

// ==========================================
// Tag Reducer
// ==========================================

describe('tagReducer', () => {
  const baseTag: Tag = { id: 'tag-1', name: 'Earnings', color: '#ff0000', type: 'both' };

  it('should add a tag with generated id', () => {
    const { id: _, ...tagWithoutId } = baseTag;
    const result = tagReducer([], { type: 'ADD', tag: tagWithoutId });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Earnings');
    expect(result[0].id).toBeDefined();
  });

  it('should update a tag', () => {
    const result = tagReducer([baseTag], { type: 'UPDATE', id: 'tag-1', updates: { name: 'New Name' } });
    expect(result[0].name).toBe('New Name');
  });

  it('should delete a tag', () => {
    const result = tagReducer([baseTag], { type: 'DELETE', id: 'tag-1' });
    expect(result).toHaveLength(0);
  });

  it('should set all tags', () => {
    const newTags = [{ ...baseTag, id: 'new-1' }];
    const result = tagReducer([baseTag], { type: 'SET_ALL', tags: newTags });
    expect(result).toEqual(newTags);
  });
});

// ==========================================
// Template Reducer
// ==========================================

describe('templateReducer', () => {
  const baseTemplate: TransactionTemplate = {
    id: 'tmpl-1',
    name: 'Weekly CSP',
    type: 'option',
    strategy: 'cash-secured-put'
  };

  it('should add a template with generated id', () => {
    const { id: _, ...tmplWithoutId } = baseTemplate;
    const result = templateReducer([], { type: 'ADD', template: tmplWithoutId });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Weekly CSP');
  });

  it('should update a template', () => {
    const result = templateReducer([baseTemplate], { type: 'UPDATE', id: 'tmpl-1', updates: { name: 'Monthly CSP' } });
    expect(result[0].name).toBe('Monthly CSP');
  });

  it('should delete a template', () => {
    const result = templateReducer([baseTemplate], { type: 'DELETE', id: 'tmpl-1' });
    expect(result).toHaveLength(0);
  });

  it('should set all templates', () => {
    const newTemplates = [{ ...baseTemplate, id: 'new-1' }];
    const result = templateReducer([baseTemplate], { type: 'SET_ALL', templates: newTemplates });
    expect(result).toEqual(newTemplates);
  });
});
