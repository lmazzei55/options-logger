import { useReducer, useCallback } from 'react';
import type { InvestmentAccount } from '../types';
import { generateId } from '../utils/calculations';

// ==========================================
// Pure reducer (testable without React)
// ==========================================

export type AccountAction =
  | { type: 'ADD'; account: Omit<InvestmentAccount, 'id'> }
  | { type: 'UPDATE'; id: string; updates: Partial<InvestmentAccount> }
  | { type: 'DELETE'; id: string }
  | { type: 'UPDATE_CASH'; accountId: string; cashChange: number }
  | { type: 'SET_ALL'; accounts: InvestmentAccount[] };

export function accountReducer(state: InvestmentAccount[], action: AccountAction): InvestmentAccount[] {
  switch (action.type) {
    case 'ADD':
      return [...state, { ...action.account, id: generateId() }];
    case 'UPDATE':
      return state.map(acc => acc.id === action.id ? { ...acc, ...action.updates } : acc);
    case 'DELETE':
      return state.filter(acc => acc.id !== action.id);
    case 'UPDATE_CASH':
      return state.map(acc =>
        acc.id === action.accountId
          ? { ...acc, currentCash: acc.currentCash + action.cashChange }
          : acc
      );
    case 'SET_ALL':
      return action.accounts;
    default:
      return state;
  }
}

// ==========================================
// React hook
// ==========================================

export function useAccountState() {
  const [accounts, dispatch] = useReducer(accountReducer, []);

  const addAccount = useCallback((account: Omit<InvestmentAccount, 'id'>) => {
    dispatch({ type: 'ADD', account });
  }, []);

  const updateAccount = useCallback((id: string, updates: Partial<InvestmentAccount>) => {
    dispatch({ type: 'UPDATE', id, updates });
  }, []);

  const deleteAccount = useCallback((id: string) => {
    dispatch({ type: 'DELETE', id });
  }, []);

  const updateCash = useCallback((accountId: string, cashChange: number) => {
    dispatch({ type: 'UPDATE_CASH', accountId, cashChange });
  }, []);

  const setAccounts = useCallback((accounts: InvestmentAccount[]) => {
    dispatch({ type: 'SET_ALL', accounts });
  }, []);

  return {
    accounts,
    addAccount,
    updateAccount,
    deleteAccount,
    updateCash,
    setAccounts,
    dispatch
  };
}
