import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  InvestmentAccount,
  StockTransaction,
  OptionTransaction,
  Tag,
  TransactionTemplate,
  AppSettings
} from '../types';
import { applyMigrations, CURRENT_SCHEMA_VERSION } from '../utils/migrations';
import { generateMockData } from '../utils/mockData';
import { defaultSettings } from './useSettingsState';

export const STORAGE_KEY = 'investment-tracker-data';
export const BACKUP_KEY = 'investment-tracker-backup';
const SAVE_DEBOUNCE_MS = 300;

interface AllState {
  accounts: InvestmentAccount[];
  stockTransactions: StockTransaction[];
  optionTransactions: OptionTransaction[];
  tags: Tag[];
  templates: TransactionTemplate[];
  settings: AppSettings;
  selectedAccountId: string | null;
}

interface StateSetters {
  setAccounts: (accounts: InvestmentAccount[]) => void;
  setStockTransactions: (transactions: StockTransaction[]) => void;
  setOptionTransactions: (transactions: OptionTransaction[]) => void;
  setTags: (tags: Tag[]) => void;
  setTemplates: (templates: TransactionTemplate[]) => void;
  setSettings: (settings: AppSettings) => void;
  setSelectedAccountId: (id: string | null) => void;
}

interface DataManagementParams {
  state: AllState;
  setters: StateSetters;
  addToast: (toast: { type: 'success' | 'error' | 'warning' | 'info'; title: string; message: string; duration?: number }) => void;
}

export function useDataManagement({ state, setters, addToast }: DataManagementParams) {
  const [hasBackup, setHasBackup] = useState(false);
  const isInitialMount = useRef(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDataRef = useRef<string | null>(null);

  // ==========================================
  // Load from localStorage on mount
  // ==========================================

  useEffect(() => {
    setHasBackup(!!localStorage.getItem(BACKUP_KEY));
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const raw = JSON.parse(savedData);
        const parsed = applyMigrations(raw);
        setters.setAccounts((parsed.accounts as InvestmentAccount[]) || []);
        setters.setStockTransactions((parsed.stockTransactions as StockTransaction[]) || []);
        setters.setOptionTransactions((parsed.optionTransactions as OptionTransaction[]) || []);
        setters.setTags((parsed.tags as Tag[]) || []);
        setters.setTemplates((parsed.templates as TransactionTemplate[]) || []);
        setters.setSettings({ ...defaultSettings, ...(parsed.settings as Partial<AppSettings>) });
        setters.setSelectedAccountId((parsed.selectedAccountId as string | null) || null);
        if (raw.schemaVersion !== CURRENT_SCHEMA_VERSION) {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        }
      } catch (error) {
        console.error('Failed to load data from localStorage:', error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ==========================================
  // Debounced save to localStorage
  // ==========================================

  const flushSave = useCallback(() => {
    if (pendingDataRef.current !== null) {
      try {
        localStorage.setItem(STORAGE_KEY, pendingDataRef.current);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.error('localStorage quota exceeded.');
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
      ...state
    };

    pendingDataRef.current = JSON.stringify(dataToSave);

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      flushSave();
      saveTimeoutRef.current = null;
    }, SAVE_DEBOUNCE_MS);
  }, [
    state.accounts, state.stockTransactions, state.optionTransactions,
    state.tags, state.templates, state.settings, state.selectedAccountId,
    flushSave, state
  ]);

  // ==========================================
  // Backup
  // ==========================================

  const createBackup = useCallback(() => {
    try {
      const backup = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        ...state,
        backupDate: new Date().toISOString()
      };
      localStorage.setItem(BACKUP_KEY, JSON.stringify(backup));
      setHasBackup(true);
    } catch (error) {
      console.error('Failed to create backup:', error);
    }
  }, [state]);

  const restoreFromBackup = useCallback((): boolean => {
    const backupData = localStorage.getItem(BACKUP_KEY);
    if (!backupData) return false;
    try {
      const parsed = JSON.parse(backupData);
      setters.setAccounts(parsed.accounts || []);
      setters.setStockTransactions(parsed.stockTransactions || []);
      setters.setOptionTransactions(parsed.optionTransactions || []);
      setters.setTags(parsed.tags || []);
      setters.setTemplates(parsed.templates || []);
      setters.setSettings({ ...defaultSettings, ...parsed.settings });
      setters.setSelectedAccountId(parsed.selectedAccountId || null);
      addToast({ type: 'success', title: 'Backup Restored', message: `Restored from backup created at ${parsed.backupDate || 'unknown time'}` });
      return true;
    } catch (error) {
      console.error('Failed to restore from backup:', error);
      addToast({ type: 'error', title: 'Restore Failed', message: 'Could not restore from backup.' });
      return false;
    }
  }, [addToast, setters]);

  // ==========================================
  // Mock data, clear, export, import
  // ==========================================

  const loadMockData = useCallback(() => {
    createBackup();
    const mockData = generateMockData();
    setters.setAccounts(mockData.accounts);
    setters.setStockTransactions(mockData.stockTransactions);
    setters.setOptionTransactions(mockData.optionTransactions);
    setters.setTags(mockData.tags);
    setters.setTemplates(mockData.templates);
    setters.setSelectedAccountId(null);
  }, [createBackup, setters]);

  const clearAllData = useCallback(() => {
    createBackup();
    setters.setAccounts([]);
    setters.setStockTransactions([]);
    setters.setOptionTransactions([]);
    setters.setTags([]);
    setters.setTemplates([]);
    setters.setSettings(defaultSettings);
    setters.setSelectedAccountId(null);
  }, [createBackup, setters]);

  const exportData = useCallback((): string => {
    return JSON.stringify({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      ...state,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    }, null, 2);
  }, [state]);

  const importData = useCallback((jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid data format');
      }

      const importAccounts: InvestmentAccount[] = parsed.accounts || [];
      const importStockTxns: StockTransaction[] = parsed.stockTransactions || [];
      const importOptionTxns: OptionTransaction[] = parsed.optionTransactions || [];
      const accountIds = new Set(importAccounts.map((a: InvestmentAccount) => a.id));

      // Validate stock transactions
      const errors: string[] = [];
      for (let i = 0; i < importStockTxns.length; i++) {
        const txn = importStockTxns[i];
        if (!txn.id || !txn.accountId || !txn.ticker || !txn.date) {
          errors.push(`Stock transaction ${i + 1}: Missing required fields`);
          continue;
        }
        if (!accountIds.has(txn.accountId)) {
          errors.push(`Stock transaction ${i + 1} (${txn.ticker}): References non-existent account ${txn.accountId}`);
        }
        if (isNaN(new Date(txn.date).getTime())) {
          errors.push(`Stock transaction ${i + 1} (${txn.ticker}): Invalid date format`);
        }
        if (typeof txn.shares !== 'number' || txn.shares <= 0) {
          errors.push(`Stock transaction ${i + 1} (${txn.ticker}): Invalid shares`);
        }
        if (typeof txn.pricePerShare !== 'number' || txn.pricePerShare < 0) {
          errors.push(`Stock transaction ${i + 1} (${txn.ticker}): Invalid price`);
        }
      }

      // Validate option transactions
      for (let i = 0; i < importOptionTxns.length; i++) {
        const txn = importOptionTxns[i];
        if (!txn.id || !txn.accountId || !txn.ticker || !txn.transactionDate || !txn.expirationDate) {
          errors.push(`Option transaction ${i + 1}: Missing required fields`);
          continue;
        }
        if (!accountIds.has(txn.accountId)) {
          errors.push(`Option transaction ${i + 1} (${txn.ticker}): References non-existent account ${txn.accountId}`);
        }
        if (isNaN(new Date(txn.transactionDate).getTime())) {
          errors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid transaction date`);
        }
        if (isNaN(new Date(txn.expirationDate).getTime())) {
          errors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid expiration date`);
        }
        if (typeof txn.contracts !== 'number' || txn.contracts <= 0) {
          errors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid contracts`);
        }
        if (typeof txn.strikePrice !== 'number' || txn.strikePrice <= 0) {
          errors.push(`Option transaction ${i + 1} (${txn.ticker}): Invalid strike price`);
        }
      }

      if (errors.length > 0) {
        throw new Error(`Import validation failed:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : ''}`);
      }

      createBackup();
      setters.setAccounts(importAccounts);
      setters.setStockTransactions(importStockTxns);
      setters.setOptionTransactions(importOptionTxns);
      setters.setTags(parsed.tags || []);
      setters.setTemplates(parsed.templates || []);
      if (parsed.settings) {
        setters.setSettings({ ...defaultSettings, ...parsed.settings });
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
  }, [addToast, createBackup, setters]);

  return {
    hasBackup,
    loadMockData,
    clearAllData,
    exportData,
    importData,
    restoreFromBackup
  };
}
