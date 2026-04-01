import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import type {
  InvestmentAccount,
  StockTransaction,
  OptionTransaction,
  Tag,
  TransactionTemplate,
  AppSettings,
  StockPosition,
  OptionPosition
} from '../types';
import {
  calculateStockPositions,
  calculateOptionPositions
} from '../utils/calculations';
import { applyPremiumAdjustments } from '../utils/premiumAdjustedCalculations';
import { detectStockWashSales } from '../utils/positionCalculations';
import { planOptionClose, checkOptionWashSale } from '../utils/optionClosing';
import { useToast } from '../components/notifications/ToastContainer';

// Domain hooks
import { useAccountState } from './useAccountState';
import { useStockTransactionState, getStockCashChange } from './useStockTransactionState';
import { useOptionTransactionState, getOptionCashChange } from './useOptionTransactionState';
import { useSettingsState } from './useSettingsState';
import { useDataManagement } from './useDataManagement';
import { useHistory } from './useHistory';

interface AppContextType {
  // Data
  accounts: InvestmentAccount[];
  stockTransactions: StockTransaction[];
  optionTransactions: OptionTransaction[];
  tags: Tag[];
  templates: TransactionTemplate[];
  settings: AppSettings;

  // Calculated data
  stockPositions: StockPosition[];
  optionPositions: OptionPosition[];

  // Selected account filter
  selectedAccountId: string | null;
  setSelectedAccountId: (id: string | null) => void;

  // Account actions
  addAccount: (account: Omit<InvestmentAccount, 'id'>) => void;
  updateAccount: (id: string, account: Partial<InvestmentAccount>) => void;
  deleteAccount: (id: string) => void;

  // Stock transaction actions
  addStockTransaction: (transaction: Omit<StockTransaction, 'id'>) => void;
  updateStockTransaction: (id: string, transaction: Partial<StockTransaction>) => void;
  deleteStockTransaction: (id: string) => void;

  // Option transaction actions
  addOptionTransaction: (transaction: Omit<OptionTransaction, 'id'>) => string;
  updateOptionTransaction: (id: string, transaction: Partial<OptionTransaction>) => void;
  deleteOptionTransaction: (id: string) => void;

  // Option assignment/exercise workflow
  closeOptionPosition: (
    positionId: string,
    closeType: 'closed' | 'expired' | 'assigned',
    closePrice?: number,
    fees?: number,
    contractsToClose?: number
  ) => void;

  // Tag actions
  addTag: (tag: Omit<Tag, 'id'>) => void;
  updateTag: (id: string, tag: Partial<Tag>) => void;
  deleteTag: (id: string) => void;

  // Template actions
  addTemplate: (template: Omit<TransactionTemplate, 'id'>) => void;
  updateTemplate: (id: string, template: Partial<TransactionTemplate>) => void;
  deleteTemplate: (id: string) => void;

  // Settings actions
  updateSettings: (settings: Partial<AppSettings>) => void;

  // Data management
  loadMockData: () => void;
  clearAllData: () => void;
  exportData: () => string;
  importData: (jsonData: string) => boolean;
  restoreFromBackup: () => boolean;
  hasBackup: boolean;
  storageUsedBytes: number;
  storageQuotaBytes: number;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const { addToast } = useToast();

  // Domain state hooks
  const accountState = useAccountState();
  const stockState = useStockTransactionState();
  const optionState = useOptionTransactionState();
  const settingsState = useSettingsState();
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Calculate positions whenever transactions change
  const baseStockPositions = calculateStockPositions(stockState.stockTransactions, selectedAccountId || undefined);
  const optionPositions = calculateOptionPositions(optionState.optionTransactions, selectedAccountId || undefined);

  const stockPositions = settingsState.settings.adjustCostBasisWithPremiums
    ? applyPremiumAdjustments(baseStockPositions, optionState.optionTransactions)
    : baseStockPositions;

  // ==========================================
  // Cross-domain orchestration
  // ==========================================

  // Delete account cascades to transactions
  const deleteAccount = useCallback((id: string) => {
    accountState.deleteAccount(id);
    stockState.deleteByAccount(id);
    optionState.deleteByAccount(id);
    if (selectedAccountId === id) {
      setSelectedAccountId(null);
    }
  }, [accountState, stockState, optionState, selectedAccountId]);

  // Add stock transaction with cash balance update + wash sale detection
  const addStockTransaction = useCallback((transaction: Omit<StockTransaction, 'id'>) => {
    const newTxn = stockState.addStockTransactionRaw(transaction);
    const cashChange = getStockCashChange(newTxn);
    if (cashChange !== 0) {
      accountState.updateCash(transaction.accountId, cashChange);
    }

    // Wash sale detection
    const allStockTxns = [...stockState.stockTransactions, newTxn];
    const washSaleInfo = detectStockWashSales(allStockTxns, newTxn.id);
    if (washSaleInfo?.hasWashSale) {
      const msg = transaction.action === 'buy'
        ? `You are buying ${transaction.ticker} within 30 days of selling it at a loss of $${washSaleInfo.lossAmount.toFixed(2)}. This may trigger wash sale rules. Please consult a tax professional.`
        : `You sold ${transaction.ticker} at a loss of $${washSaleInfo.lossAmount.toFixed(2)} with ${washSaleInfo.relatedTransactionIds.length} related buy(s) within 30 days. This may trigger wash sale rules.`;
      addToast({ type: 'warning', title: 'Potential Wash Sale Detected', message: msg, duration: 10000 });
    }

    return newTxn.id;
  }, [stockState, accountState, addToast]);

  // Update stock transaction with cash balance adjustment
  const updateStockTransaction = useCallback((id: string, updates: Partial<StockTransaction>) => {
    const oldTxn = stockState.stockTransactions.find(t => t.id === id);
    if (oldTxn) {
      const newTxn = { ...oldTxn, ...updates };
      const cashDiff = getStockCashChange(newTxn) - getStockCashChange(oldTxn);
      if (cashDiff !== 0) {
        accountState.updateCash(oldTxn.accountId, cashDiff);
      }
    }
    stockState.updateStockTransaction(id, updates);
  }, [stockState, accountState]);

  // Delete stock transaction with cash balance reversal
  const deleteStockTransaction = useCallback((id: string) => {
    const txn = stockState.stockTransactions.find(t => t.id === id);
    if (txn) {
      const cashChange = -getStockCashChange(txn);
      if (cashChange !== 0) {
        accountState.updateCash(txn.accountId, cashChange);
      }
    }
    stockState.deleteStockTransactionRaw(id);
  }, [stockState, accountState]);

  // Add option transaction with cash balance update
  const addOptionTransaction = useCallback((transaction: Omit<OptionTransaction, 'id'>): string => {
    const newId = optionState.addOptionTransactionRaw(transaction);
    const newTxn = { ...transaction, id: newId } as OptionTransaction;
    const cashChange = getOptionCashChange(newTxn);
    if (cashChange !== 0) {
      accountState.updateCash(transaction.accountId, cashChange);
    }
    return newId;
  }, [optionState, accountState]);

  // Update option transaction with cash balance adjustment
  const updateOptionTransaction = useCallback((id: string, updates: Partial<OptionTransaction>) => {
    const oldTxn = optionState.optionTransactions.find(t => t.id === id);
    if (oldTxn) {
      const newTxn = { ...oldTxn, ...updates };
      const cashDiff = getOptionCashChange(newTxn) - getOptionCashChange(oldTxn);
      if (cashDiff !== 0) {
        accountState.updateCash(oldTxn.accountId, cashDiff);
      }
    }
    optionState.updateOptionTransaction(id, updates);
  }, [optionState, accountState]);

  // Delete option transaction with cash balance reversal
  const deleteOptionTransaction = useCallback((id: string) => {
    const txn = optionState.optionTransactions.find(t => t.id === id);
    if (txn) {
      const cashChange = -getOptionCashChange(txn);
      if (cashChange !== 0) {
        accountState.updateCash(txn.accountId, cashChange);
      }
    }
    optionState.deleteOptionTransactionRaw(id);
  }, [optionState, accountState]);

  // Close option position (creates closing txn + optional stock txn)
  const closeOptionPosition = useCallback((
    positionId: string,
    closeType: 'closed' | 'expired' | 'assigned',
    closePrice?: number,
    fees?: number,
    contractsToClose?: number
  ) => {
    const result = planOptionClose(
      { positionId, closeType, closePrice, fees, contractsToClose },
      optionState.optionTransactions
    );
    if (!result) return;

    const newTxnId = addOptionTransaction(result.closingOptionTxn);

    const washSale = checkOptionWashSale(
      newTxnId, result.closingOptionTxn, optionState.optionTransactions, result.realizedPL
    );
    if (washSale.hasWashSale) {
      addToast({
        type: 'warning',
        title: 'Potential Wash Sale Detected',
        message: `You closed ${result.closingOptionTxn.ticker} at a loss of $${washSale.lossAmount.toFixed(2)} with ${washSale.relatedCount} related transaction(s) within 30 days. This may trigger wash sale rules.`,
        duration: 10000
      });
    }

    if (result.stockTxn) {
      addStockTransaction(result.stockTxn);
    }
  }, [optionState.optionTransactions, addOptionTransaction, addStockTransaction, addToast]);

  // ==========================================
  // Data management (persistence, backup, import/export)
  // ==========================================

  const stateForPersistence = useMemo(() => ({
    accounts: accountState.accounts,
    stockTransactions: stockState.stockTransactions,
    optionTransactions: optionState.optionTransactions,
    tags: settingsState.tags,
    templates: settingsState.templates,
    settings: settingsState.settings,
    selectedAccountId
  }), [
    accountState.accounts, stockState.stockTransactions, optionState.optionTransactions,
    settingsState.tags, settingsState.templates, settingsState.settings, selectedAccountId
  ]);

  const stateSetters = useMemo(() => ({
    setAccounts: accountState.setAccounts,
    setStockTransactions: stockState.setStockTransactions,
    setOptionTransactions: optionState.setOptionTransactions,
    setTags: settingsState.setTags,
    setTemplates: settingsState.setTemplates,
    setSettings: settingsState.setSettings,
    setSelectedAccountId
  }), [
    accountState.setAccounts, stockState.setStockTransactions, optionState.setOptionTransactions,
    settingsState.setTags, settingsState.setTemplates, settingsState.setSettings
  ]);

  const dataManagement = useDataManagement({
    state: stateForPersistence,
    setters: stateSetters,
    addToast
  });

  const history = useHistory(stateForPersistence, stateSetters);

  // ==========================================
  // Context value
  // ==========================================

  const value: AppContextType = {
    accounts: accountState.accounts,
    stockTransactions: stockState.stockTransactions,
    optionTransactions: optionState.optionTransactions,
    tags: settingsState.tags,
    templates: settingsState.templates,
    settings: settingsState.settings,
    stockPositions,
    optionPositions,
    selectedAccountId,
    setSelectedAccountId,
    addAccount: accountState.addAccount,
    updateAccount: accountState.updateAccount,
    deleteAccount,
    addStockTransaction,
    updateStockTransaction,
    deleteStockTransaction,
    addOptionTransaction,
    updateOptionTransaction,
    deleteOptionTransaction,
    closeOptionPosition,
    addTag: settingsState.addTag,
    updateTag: settingsState.updateTag,
    deleteTag: settingsState.deleteTag,
    addTemplate: settingsState.addTemplate,
    updateTemplate: settingsState.updateTemplate,
    deleteTemplate: settingsState.deleteTemplate,
    updateSettings: settingsState.updateSettings,
    loadMockData: dataManagement.loadMockData,
    clearAllData: dataManagement.clearAllData,
    exportData: dataManagement.exportData,
    importData: dataManagement.importData,
    restoreFromBackup: dataManagement.restoreFromBackup,
    hasBackup: dataManagement.hasBackup,
    storageUsedBytes: dataManagement.storageUsedBytes,
    storageQuotaBytes: dataManagement.storageQuotaBytes,
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
