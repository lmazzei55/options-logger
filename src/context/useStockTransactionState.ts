import { useReducer, useCallback } from 'react';
import type { StockTransaction } from '../types';
import { generateId } from '../utils/calculations';

// ==========================================
// Pure reducer (testable without React)
// ==========================================

export type StockTransactionAction =
  | { type: 'ADD'; transaction: StockTransaction }
  | { type: 'UPDATE'; id: string; updates: Partial<StockTransaction> }
  | { type: 'DELETE'; id: string }
  | { type: 'DELETE_BY_ACCOUNT'; accountId: string }
  | { type: 'SET_ALL'; transactions: StockTransaction[] };

export function stockTransactionReducer(
  state: StockTransaction[],
  action: StockTransactionAction
): StockTransaction[] {
  switch (action.type) {
    case 'ADD':
      return [...state, action.transaction];
    case 'UPDATE':
      return state.map(t => t.id === action.id ? { ...t, ...action.updates } : t);
    case 'DELETE':
      return state.filter(t => t.id !== action.id);
    case 'DELETE_BY_ACCOUNT':
      return state.filter(t => t.accountId !== action.accountId);
    case 'SET_ALL':
      return action.transactions;
    default:
      return state;
  }
}

// ==========================================
// Cash impact helpers (pure, testable)
// ==========================================

export function getStockCashChange(txn: StockTransaction): number {
  if (txn.action === 'buy') return -(txn.totalAmount + txn.fees);
  if (txn.action === 'sell') return txn.totalAmount - txn.fees;
  if (txn.action === 'dividend') return txn.totalAmount;
  return 0;
}

// ==========================================
// React hook
// ==========================================

export function useStockTransactionState() {
  const [stockTransactions, dispatch] = useReducer(stockTransactionReducer, []);

  const addStockTransactionRaw = useCallback((transaction: Omit<StockTransaction, 'id'>): StockTransaction => {
    const newTxn: StockTransaction = { ...transaction, id: generateId() };
    dispatch({ type: 'ADD', transaction: newTxn });
    return newTxn;
  }, []);

  const updateStockTransaction = useCallback((id: string, updates: Partial<StockTransaction>) => {
    dispatch({ type: 'UPDATE', id, updates });
  }, []);

  const deleteStockTransactionRaw = useCallback((id: string) => {
    dispatch({ type: 'DELETE', id });
  }, []);

  const deleteByAccount = useCallback((accountId: string) => {
    dispatch({ type: 'DELETE_BY_ACCOUNT', accountId });
  }, []);

  const setStockTransactions = useCallback((transactions: StockTransaction[]) => {
    dispatch({ type: 'SET_ALL', transactions });
  }, []);

  return {
    stockTransactions,
    addStockTransactionRaw,
    updateStockTransaction,
    deleteStockTransactionRaw,
    deleteByAccount,
    setStockTransactions,
    dispatch
  };
}
