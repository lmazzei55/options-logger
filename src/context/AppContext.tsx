import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  calculateOptionPositions,
  generateId
} from '../utils/calculations';
import { applyPremiumAdjustments } from '../utils/premiumAdjustedCalculations';
import { generateMockData } from '../utils/mockData';
import { detectStockWashSales } from '../utils/positionCalculations';
import { planOptionClose, checkOptionWashSale } from '../utils/optionClosing';
import { useToast } from '../components/notifications/ToastContainer';
import { applyMigrations, CURRENT_SCHEMA_VERSION } from '../utils/migrations';

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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'investment-tracker-data';
const BACKUP_KEY = 'investment-tracker-backup';
const SAVE_DEBOUNCE_MS = 300;

const defaultSettings: AppSettings = {
  theme: 'system',
  defaultCurrency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  showAllAccountsView: true,
  enablePriceFetching: false,
  adjustCostBasisWithPremiums: false, // Default: off to preserve existing behavior
  chartPreferences: {
    defaultTimeRange: '6M',
    defaultChartType: 'line'
  },
  taxRates: {
    shortTerm: 24,
    longTerm: 15
  }
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const { addToast } = useToast();
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [stockTransactions, setStockTransactions] = useState<StockTransaction[]>([]);
  const [optionTransactions, setOptionTransactions] = useState<OptionTransaction[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const isInitialMount = useRef(true);
  
  // Calculate positions whenever transactions change
  const baseStockPositions = calculateStockPositions(stockTransactions, selectedAccountId || undefined);
  const optionPositions = calculateOptionPositions(optionTransactions, selectedAccountId || undefined);
  
  // Apply premium adjustments if enabled in settings
  const stockPositions = settings.adjustCostBasisWithPremiums
    ? applyPremiumAdjustments(baseStockPositions, optionTransactions)
    : baseStockPositions;
  
  const [hasBackup, setHasBackup] = useState(false);

  // Load data from localStorage on mount (with migration support)
  useEffect(() => {
    setHasBackup(!!localStorage.getItem(BACKUP_KEY));
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const raw = JSON.parse(savedData);
        const parsed = applyMigrations(raw);
        setAccounts((parsed.accounts as InvestmentAccount[]) || []);
        setStockTransactions((parsed.stockTransactions as StockTransaction[]) || []);
        setOptionTransactions((parsed.optionTransactions as OptionTransaction[]) || []);
        setTags((parsed.tags as Tag[]) || []);
        setTemplates((parsed.templates as TransactionTemplate[]) || []);
        setSettings({ ...defaultSettings, ...(parsed.settings as Partial<AppSettings>) });
        setSelectedAccountId((parsed.selectedAccountId as string | null) || null);
        // Re-save if migration bumped the version
        if (raw.schemaVersion !== CURRENT_SCHEMA_VERSION) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (error) {
        console.error('Failed to load data from localStorage:', error);
      }
    }
  }, []);
  
  // Debounced save to localStorage (skip initial render, flush on unload)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<string | null>(null);

  const flushSave = useCallback(() => {
    if (pendingDataRef.current !== null) {
      try {
        localStorage.setItem(STORAGE_KEY, pendingDataRef.current);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.error('localStorage quota exceeded. Data not saved. Consider exporting your data as a backup.');
        } else {
          console.error('Failed to save data to localStorage:', error);
        }
      }
      pendingDataRef.current = null;
    }
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => flushSave();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      flushSave();
    };
  }, [flushSave]);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const dataToSave = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      accounts,
      stockTransactions,
      optionTransactions,
      tags,
      templates,
      settings,
      selectedAccountId
    };

    pendingDataRef.current = JSON.stringify(dataToSave);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      flushSave();
      saveTimeoutRef.current = null;
    }, SAVE_DEBOUNCE_MS);
  }, [accounts, stockTransactions, optionTransactions, tags, templates, settings, selectedAccountId, flushSave]);
  
  // ==========================================
  // ACCOUNT ACTIONS
  // ==========================================
  
  const addAccount = (account: Omit<InvestmentAccount, 'id'>) => {
    const newAccount: InvestmentAccount = {
      ...account,
      id: generateId()
    };
    setAccounts(prev => [...prev, newAccount]);
  };
  
  const updateAccount = useCallback((id: string, updates: Partial<InvestmentAccount>) => {
    setAccounts(prev => prev.map(acc => acc.id === id ? { ...acc, ...updates } : acc));
  }, []);
  
  const deleteAccount = (id: string) => {
    setAccounts(prev => prev.filter(acc => acc.id !== id));
    setStockTransactions(prev => prev.filter(t => t.accountId !== id));
    setOptionTransactions(prev => prev.filter(t => t.accountId !== id));
    if (selectedAccountId === id) {
      setSelectedAccountId(null);
    }
  };
  
  // ==========================================
  // STOCK TRANSACTION ACTIONS
  // ==========================================
  
  const addStockTransaction = useCallback((transaction: Omit<StockTransaction, 'id'>) => {
    const newTransaction: StockTransaction = {
      ...transaction,
      id: generateId()
    };
    setStockTransactions(prev => [...prev, newTransaction]);
    
    // Update account cash balance
    setAccounts(prev => prev.map(acc => {
      if (acc.id !== transaction.accountId) return acc;
      
      let cashChange = 0;
      if (transaction.action === 'buy') {
        cashChange = -(transaction.totalAmount + transaction.fees);
      } else if (transaction.action === 'sell') {
        cashChange = transaction.totalAmount - transaction.fees;
      } else if (transaction.action === 'dividend') {
        cashChange = transaction.totalAmount;
      }
      
      return { ...acc, currentCash: acc.currentCash + cashChange };
    }));
    
    // Check for wash sale on ANY stock transaction (buy or sell)
    // Wash sale: selling at a loss and buying same stock within 30 days
    // Need to check both directions:
    // - When selling: did I sell at a loss with buys nearby?
    // - When buying: was there a recent sell at a loss?
    const allStockTxns = [...stockTransactions, newTransaction];
    const washSaleInfo = detectStockWashSales(allStockTxns, newTransaction.id);
    
    if (washSaleInfo && washSaleInfo.hasWashSale) {
      if (transaction.action === 'buy') {
        addToast({
          type: 'warning',
          title: 'Potential Wash Sale Detected',
          message: `You are buying ${transaction.ticker} within 30 days of selling it at a loss of $${washSaleInfo.lossAmount.toFixed(2)}. This may trigger wash sale rules. Please consult a tax professional.`,
          duration: 10000
        });
      } else if (transaction.action === 'sell') {
        addToast({
          type: 'warning',
          title: 'Potential Wash Sale Detected',
          message: `You sold ${transaction.ticker} at a loss of $${washSaleInfo.lossAmount.toFixed(2)} with ${washSaleInfo.relatedTransactionIds.length} related buy(s) within 30 days. This may trigger wash sale rules.`,
          duration: 10000
        });
      }
    }
    
    return newTransaction.id;
  }, [stockTransactions, addToast]);
  
  const updateStockTransaction = (id: string, updates: Partial<StockTransaction>) => {
    setStockTransactions(prev => {
      const oldTxn = prev.find(t => t.id === id);
      if (oldTxn) {
        const newTxn = { ...oldTxn, ...updates };
        // Reverse old cash impact and apply new one
        const oldCashChange = oldTxn.action === 'buy' ? -(oldTxn.totalAmount + oldTxn.fees)
          : oldTxn.action === 'sell' ? (oldTxn.totalAmount - oldTxn.fees)
          : oldTxn.action === 'dividend' ? oldTxn.totalAmount : 0;
        const newCashChange = newTxn.action === 'buy' ? -(newTxn.totalAmount + newTxn.fees)
          : newTxn.action === 'sell' ? (newTxn.totalAmount - newTxn.fees)
          : newTxn.action === 'dividend' ? newTxn.totalAmount : 0;
        const cashDiff = newCashChange - oldCashChange;
        if (cashDiff !== 0) {
          setAccounts(prevAccounts => prevAccounts.map(acc =>
            acc.id === oldTxn.accountId ? { ...acc, currentCash: acc.currentCash + cashDiff } : acc
          ));
        }
      }
      return prev.map(t => t.id === id ? { ...t, ...updates } : t);
    });
  };
  
  const deleteStockTransaction = (id: string) => {
    setStockTransactions(prev => {
      const txn = prev.find(t => t.id === id);
      if (txn) {
        // Reverse the cash impact
        let cashChange = 0;
        if (txn.action === 'buy') {
          cashChange = txn.totalAmount + txn.fees; // Reverse: add back the money spent
        } else if (txn.action === 'sell') {
          cashChange = -(txn.totalAmount - txn.fees); // Reverse: remove the money received
        } else if (txn.action === 'dividend') {
          cashChange = -txn.totalAmount; // Reverse: remove the dividend
        }
        if (cashChange !== 0) {
          setAccounts(prevAccounts => prevAccounts.map(acc =>
            acc.id === txn.accountId ? { ...acc, currentCash: acc.currentCash + cashChange } : acc
          ));
        }
      }
      return prev.filter(t => t.id !== id);
    });
  };
  
  // ==========================================
  // OPTION TRANSACTION ACTIONS
  // ==========================================
  
  const addOptionTransaction = useCallback((transaction: Omit<OptionTransaction, 'id'>): string => {
    const newId = generateId();
    const newTransaction: OptionTransaction = {
      ...transaction,
      id: newId
    };
    setOptionTransactions(prev => [...prev, newTransaction]);
    
    // Update account cash balance
    // IMPORTANT: Cash accounting for options:
    // - sell-to-open: receive premium (cash += premium - fees)
    //   Collateral is NOT subtracted from cash - it's just "reserved" conceptually
    //   We track collateral separately in the portfolio summary
    // - buy-to-open: pay premium (cash -= premium + fees)
    // - buy-to-close: pay premium to close (cash -= premium + fees)
    // - sell-to-close: receive premium from closing (cash += premium - fees)
    setAccounts(prev => prev.map(acc => {
      if (acc.id !== transaction.accountId) return acc;
      
      let cashChange = 0;
      if (transaction.action === 'sell-to-open') {
        cashChange = transaction.totalPremium - transaction.fees;
      } else if (transaction.action === 'buy-to-open') {
        cashChange = -(transaction.totalPremium + transaction.fees);
      } else if (transaction.action === 'buy-to-close') {
        cashChange = -(transaction.totalPremium + transaction.fees);
      } else if (transaction.action === 'sell-to-close') {
        cashChange = transaction.totalPremium - transaction.fees;
      }
      
      return { ...acc, currentCash: acc.currentCash + cashChange };
    }));
    
    return newId;
  }, []);
  
  const updateOptionTransaction = (id: string, updates: Partial<OptionTransaction>) => {
    setOptionTransactions(prev => {
      const oldTxn = prev.find(t => t.id === id);
      if (oldTxn) {
        const newTxn = { ...oldTxn, ...updates };
        const getCashChange = (t: OptionTransaction) => {
          if (t.action === 'sell-to-open' || t.action === 'sell-to-close') return t.totalPremium - t.fees;
          if (t.action === 'buy-to-open' || t.action === 'buy-to-close') return -(t.totalPremium + t.fees);
          return 0;
        };
        const cashDiff = getCashChange(newTxn) - getCashChange(oldTxn);
        if (cashDiff !== 0) {
          setAccounts(prevAccounts => prevAccounts.map(acc =>
            acc.id === oldTxn.accountId ? { ...acc, currentCash: acc.currentCash + cashDiff } : acc
          ));
        }
      }
      return prev.map(t => t.id === id ? { ...t, ...updates } : t);
    });
  };
  
  const deleteOptionTransaction = (id: string) => {
    setOptionTransactions(prev => {
      const txn = prev.find(t => t.id === id);
      if (txn) {
        // Reverse the cash impact
        let cashChange = 0;
        if (txn.action === 'sell-to-open' || txn.action === 'sell-to-close') {
          cashChange = -(txn.totalPremium - txn.fees); // Reverse: remove the premium received
        } else if (txn.action === 'buy-to-open' || txn.action === 'buy-to-close') {
          cashChange = txn.totalPremium + txn.fees; // Reverse: add back the premium paid
        }
        if (cashChange !== 0) {
          setAccounts(prevAccounts => prevAccounts.map(acc =>
            acc.id === txn.accountId ? { ...acc, currentCash: acc.currentCash + cashChange } : acc
          ));
        }
      }
      return prev.filter(t => t.id !== id);
    });
  };
  
  // ==========================================
  // CLOSE OPTION POSITION (with proper downstream effects)
  // ==========================================
  
  const closeOptionPosition = useCallback((
    positionId: string,
    closeType: 'closed' | 'expired' | 'assigned',
    closePrice?: number,
    fees?: number,
    contractsToClose?: number
  ) => {
    const result = planOptionClose(
      { positionId, closeType, closePrice, fees, contractsToClose },
      optionTransactions
    );
    if (!result) return;

    // Add the closing option transaction (handles cash for premium)
    const newTxnId = addOptionTransaction(result.closingOptionTxn);

    // Check for wash sale if this was a loss
    const washSale = checkOptionWashSale(
      newTxnId, result.closingOptionTxn, optionTransactions, result.realizedPL
    );
    if (washSale.hasWashSale) {
      addToast({
        type: 'warning',
        title: 'Potential Wash Sale Detected',
        message: `You closed ${result.closingOptionTxn.ticker} at a loss of $${washSale.lossAmount.toFixed(2)} with ${washSale.relatedCount} related transaction(s) within 30 days. This may trigger wash sale rules.`,
        duration: 10000
      });
    }

    // If assigned, create the corresponding stock transaction
    if (result.stockTxn) {
      addStockTransaction(result.stockTxn);
    }
  }, [optionTransactions, addOptionTransaction, addStockTransaction, addToast]);
  
  // ==========================================
  // TAG ACTIONS
  // ==========================================
  
  const addTag = (tag: Omit<Tag, 'id'>) => {
    const newTag: Tag = { ...tag, id: generateId() };
    setTags(prev => [...prev, newTag]);
  };
  
  const updateTag = (id: string, updates: Partial<Tag>) => {
    setTags(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteTag = (id: string) => {
    setTags(prev => prev.filter(t => t.id !== id));
  };
  
  // ==========================================
  // TEMPLATE ACTIONS
  // ==========================================
  
  const addTemplate = (template: Omit<TransactionTemplate, 'id'>) => {
    const newTemplate: TransactionTemplate = { ...template, id: generateId() };
    setTemplates(prev => [...prev, newTemplate]);
  };
  
  const updateTemplate = (id: string, updates: Partial<TransactionTemplate>) => {
    setTemplates(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
  };
  
  // ==========================================
  // SETTINGS
  // ==========================================
  
  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };
  
  // ==========================================
  // DATA MANAGEMENT
  // ==========================================

  /** Save current state to the backup key before destructive operations */
  const createBackup = useCallback(() => {
    try {
      const backup = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        accounts,
        stockTransactions,
        optionTransactions,
        tags,
        templates,
        settings,
        selectedAccountId,
        backupDate: new Date().toISOString()
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
      setHasBackup(true);
    } catch (error) {
      console.error('Failed to create backup:', error);
    }
  }, [accounts, stockTransactions, optionTransactions, tags, templates, settings, selectedAccountId]);

  const restoreFromBackup = useCallback((): boolean => {
    const backupData = localStorage.getItem(BACKUP_KEY);
    if (!backupData) return false;
    try {
      const parsed = JSON.parse(backupData);
      setAccounts(parsed.accounts || []);
      setStockTransactions(parsed.stockTransactions || []);
      setOptionTransactions(parsed.optionTransactions || []);
      setTags(parsed.tags || []);
      setTemplates(parsed.templates || []);
      setSettings({ ...defaultSettings, ...parsed.settings });
      setSelectedAccountId(parsed.selectedAccountId || null);
      addToast({ type: 'success', title: 'Backup Restored', message: `Restored from backup created at ${parsed.backupDate || 'unknown time'}` });
      return true;
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      addToast({ type: 'error', title: 'Restore Failed', message: 'Could not restore from backup.' });
      return false;
    }
  }, [addToast]);

  const loadMockData = useCallback(() => {
    createBackup();
    const mockData = generateMockData();
    setAccounts(mockData.accounts);
    setStockTransactions(mockData.stockTransactions);
    setOptionTransactions(mockData.optionTransactions);
    setTags(mockData.tags);
    setTemplates(mockData.templates);
    setSelectedAccountId(null);
  }, [createBackup]);

  const clearAllData = useCallback(() => {
    createBackup();
    setAccounts([]);
    setStockTransactions([]);
    setOptionTransactions([]);
    setTags([]);
    setTemplates([]);
    setSettings(defaultSettings);
    setSelectedAccountId(null);
  }, [createBackup]);

  const exportData = (): string => {
    return JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      accounts,
      stockTransactions,
      optionTransactions,
      tags,
      templates,
      settings,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    }, null, 2);
  };

  const importData = useCallback((jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData);

      // Validate the structure
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid data format');
      }

      const importAccounts: InvestmentAccount[] = parsed.accounts || [];
      const importStockTxns: StockTransaction[] = parsed.stockTransactions || [];
      const importOptionTxns: OptionTransaction[] = parsed.optionTransactions || [];

      // Build account ID set for referential integrity checks
      const accountIds = new Set(importAccounts.map(a => a.id));

      // Validate all stock transactions
      const stockErrors: string[] = [];
      for (let i = 0; i < importStockTxns.length; i++) {
        const txn = importStockTxns[i];

        // Check required fields
        if (!txn.id || !txn.accountId || !txn.ticker || !txn.date) {
          stockErrors.push(`Stock transaction ${i + 1}: Missing required fields`);
          continue;
        }

        // Referential integrity: accountId must exist in imported accounts
        if (!accountIds.has(txn.accountId)) {
          stockErrors.push(`Stock transaction ${i + 1} (${txn.ticker}): References non-existent account ${txn.accountId}`);
        }

        // Validate date format
        const date = new Date(txn.date);
        if (isNaN(date.getTime())) {
          stockErrors.push(`Stock transaction ${i + 1} (${txn.ticker}): Invalid date format`);
        }

        // Validate numeric fields
        if (typeof txn.shares !== 'number' || txn.shares <= 0) {
          stockErrors.push(`Stock transaction ${i + 1} (${txn.ticker}): Invalid shares`);
        }
        if (typeof txn.pricePerShare !== 'number' || txn.pricePerShare < 0) {
          stockErrors.push(`Stock transaction ${i + 1} (${txn.ticker}): Invalid price`);
        }
      }

      // Validate all option transactions
      const optionErrors: string[] = [];
      for (let i = 0; i < importOptionTxns.length; i++) {
        const txn = importOptionTxns[i];

        // Check required fields
        if (!txn.id || !txn.accountId || !txn.ticker || !txn.transactionDate || !txn.expirationDate) {
          optionErrors.push(`Option transaction ${i + 1}: Missing required fields`);
          continue;
        }

        // Referential integrity: accountId must exist in imported accounts
        if (!accountIds.has(txn.accountId)) {
          optionErrors.push(`Option transaction ${i + 1} (${txn.ticker}): References non-existent account ${txn.accountId}`);
        }

        // Validate date formats
        const txnDate = new Date(txn.transactionDate);
        const expDate = new Date(txn.expirationDate);
        if (isNaN(txnDate.getTime())) {
          optionErrors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid transaction date`);
        }
        if (isNaN(expDate.getTime())) {
          optionErrors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid expiration date`);
        }

        // Validate numeric fields
        if (typeof txn.contracts !== 'number' || txn.contracts <= 0) {
          optionErrors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid contracts`);
        }
        if (typeof txn.strikePrice !== 'number' || txn.strikePrice <= 0) {
          optionErrors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid strike price`);
        }
      }

      // If there are any validation errors, throw them (no state was mutated)
      const allErrors = [...stockErrors, ...optionErrors];
      if (allErrors.length > 0) {
        throw new Error(`Import validation failed:\n${allErrors.slice(0, 5).join('\n')}${allErrors.length > 5 ? `\n...and ${allErrors.length - 5} more errors` : ''}`);
      }

      // Backup current state before overwriting
      createBackup();

      // All validation passed, import the data
      setAccounts(importAccounts);
      setStockTransactions(importStockTxns);
      setOptionTransactions(importOptionTxns);
      setTags(parsed.tags || []);
      setTemplates(parsed.templates || []);
      if (parsed.settings) {
        setSettings({ ...defaultSettings, ...parsed.settings });
      }
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      addToast({
        type: 'error',
        title: 'Import Failed',
        message: error instanceof Error ? error.message : String(error),
        duration: 10000
      });
      return false;
    }
  }, [addToast, createBackup]);
  
  const value: AppContextType = {
    accounts,
    stockTransactions,
    optionTransactions,
    tags,
    templates,
    settings,
    stockPositions,
    optionPositions,
    selectedAccountId,
    setSelectedAccountId,
    addAccount,
    updateAccount,
    deleteAccount,
    addStockTransaction,
    updateStockTransaction,
    deleteStockTransaction,
    addOptionTransaction,
    updateOptionTransaction,
    deleteOptionTransaction,
    closeOptionPosition,
    addTag,
    updateTag,
    deleteTag,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    updateSettings,
    loadMockData,
    clearAllData,
    exportData,
    importData,
    restoreFromBackup,
    hasBackup
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
