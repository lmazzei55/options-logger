import { useReducer, useCallback } from 'react';
import type { OptionTransaction } from '../types';
import { generateId } from '../utils/calculations';

// ==========================================
// Pure reducer (testable without React)
// ==========================================

export type OptionTransactionAction =
  | { type: 'ADD'; transaction: OptionTransaction }
  | { type: 'UPDATE'; id: string; updates: Partial<OptionTransaction> }
  | { type: 'DELETE'; id: string }
  | { type: 'DELETE_BY_ACCOUNT'; accountId: string }
  | { type: 'SET_ALL'; transactions: OptionTransaction[] };

export function optionTransactionReducer(
  state: OptionTransaction[],
  action: OptionTransactionAction
): OptionTransaction[] {
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

export function getOptionCashChange(txn: OptionTransaction): number {
  if (txn.action === 'sell-to-open' || txn.action === 'sell-to-close') {
    return txn.totalPremium - txn.fees;
  }
  if (txn.action === 'buy-to-open' || txn.action === 'buy-to-close') {
    return -(txn.totalPremium + txn.fees);
  }
  return 0;
}

// ==========================================
// React hook
// ==========================================

export function useOptionTransactionState() {
  const [optionTransactions, dispatch] = useReducer(optionTransactionReducer, []);

  const addOptionTransactionRaw = useCallback((transaction: Omit<OptionTransaction, 'id'>): string => {
    const newId = generateId();
    const newTxn: OptionTransaction = { ...transaction, id: newId };
    dispatch({ type: 'ADD', transaction: newTxn });
    return newId;
  }, []);

  const updateOptionTransaction = useCallback((id: string, updates: Partial<OptionTransaction>) => {
    dispatch({ type: 'UPDATE', id, updates });
  }, []);

  const deleteOptionTransactionRaw = useCallback((id: string) => {
    dispatch({ type: 'DELETE', id });
  }, []);

  const deleteByAccount = useCallback((accountId: string) => {
    dispatch({ type: 'DELETE_BY_ACCOUNT', accountId });
  }, []);

  const setOptionTransactions = useCallback((transactions: OptionTransaction[]) => {
    dispatch({ type: 'SET_ALL', transactions });
  }, []);

  return {
    optionTransactions,
    addOptionTransactionRaw,
    updateOptionTransaction,
    deleteOptionTransactionRaw,
    deleteByAccount,
    setOptionTransactions,
    dispatch
  };
}
