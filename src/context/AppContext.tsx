import React, { createContext, useContext, useState, useEffect } from 'react';
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
import { generateMockData } from '../utils/mockData';

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
  selectedAccountId: string | null; // null means "All Accounts"
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
  addOptionTransaction: (transaction: Omit<OptionTransaction, 'id'>) => void;
  updateOptionTransaction: (id: string, transaction: Partial<OptionTransaction>) => void;
  deleteOptionTransaction: (id: string) => void;
  
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
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEY = 'investment-tracker-data';

const defaultSettings: AppSettings = {
  theme: 'system',
  defaultCurrency: 'USD',
  dateFormat: 'MM/DD/YYYY',
  showAllAccountsView: true,
  enablePriceFetching: false,
  chartPreferences: {
    defaultTimeRange: '6M',
    defaultChartType: 'line'
  }
};

interface AppProviderProps {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children }) => {
  const [accounts, setAccounts] = useState<InvestmentAccount[]>([]);
  const [stockTransactions, setStockTransactions] = useState<StockTransaction[]>([]);
  const [optionTransactions, setOptionTransactions] = useState<OptionTransaction[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [templates, setTemplates] = useState<TransactionTemplate[]>([]);
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  
  // Calculate positions whenever transactions change
  const stockPositions = calculateStockPositions(stockTransactions, selectedAccountId || undefined);
  const optionPositions = calculateOptionPositions(optionTransactions, selectedAccountId || undefined);
  
  // Load data from localStorage on mount
  useEffect(() => {
    const savedData = localStorage.getItem(STORAGE_KEY);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setAccounts(parsed.accounts || []);
        setStockTransactions(parsed.stockTransactions || []);
        setOptionTransactions(parsed.optionTransactions || []);
        setTags(parsed.tags || []);
        setTemplates(parsed.templates || []);
        setSettings({ ...defaultSettings, ...parsed.settings });
        setSelectedAccountId(parsed.selectedAccountId || null);
      } catch (error) {
        console.error('Failed to load data from localStorage:', error);
      }
    }
  }, []);
  
  // Save data to localStorage whenever it changes
  useEffect(() => {
    const dataToSave = {
      accounts,
      stockTransactions,
      optionTransactions,
      tags,
      templates,
      settings,
      selectedAccountId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dataToSave));
  }, [accounts, stockTransactions, optionTransactions, tags, templates, settings, selectedAccountId]);
  
  // Account actions
  const addAccount = (account: Omit<InvestmentAccount, 'id'>) => {
    const newAccount: InvestmentAccount = {
      ...account,
      id: generateId()
    };
    setAccounts([...accounts, newAccount]);
  };
  
  const updateAccount = (id: string, updates: Partial<InvestmentAccount>) => {
    setAccounts(accounts.map(acc => acc.id === id ? { ...acc, ...updates } : acc));
  };
  
  const deleteAccount = (id: string) => {
    setAccounts(accounts.filter(acc => acc.id !== id));
    // Also delete all transactions for this account
    setStockTransactions(stockTransactions.filter(t => t.accountId !== id));
    setOptionTransactions(optionTransactions.filter(t => t.accountId !== id));
    if (selectedAccountId === id) {
      setSelectedAccountId(null);
    }
  };
  
  // Stock transaction actions
  const addStockTransaction = (transaction: Omit<StockTransaction, 'id'>) => {
    const newTransaction: StockTransaction = {
      ...transaction,
      id: generateId()
    };
    setStockTransactions([...stockTransactions, newTransaction]);
    
    // Update account cash balance
    const account = accounts.find(a => a.id === transaction.accountId);
    if (account) {
      let cashChange = 0;
      if (transaction.action === 'buy') {
        cashChange = -(transaction.totalAmount + transaction.fees);
      } else if (transaction.action === 'sell') {
        cashChange = transaction.totalAmount - transaction.fees;
      } else if (transaction.action === 'dividend') {
        cashChange = transaction.totalAmount;
      }
      
      updateAccount(account.id, {
        currentCash: account.currentCash + cashChange
      });
    }
  };
  
  const updateStockTransaction = (id: string, updates: Partial<StockTransaction>) => {
    setStockTransactions(stockTransactions.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteStockTransaction = (id: string) => {
    setStockTransactions(stockTransactions.filter(t => t.id !== id));
  };
  
  // Option transaction actions
  const addOptionTransaction = (transaction: Omit<OptionTransaction, 'id'>) => {
    const newTransaction: OptionTransaction = {
      ...transaction,
      id: generateId()
    };
    setOptionTransactions([...optionTransactions, newTransaction]);
    
    // Update account cash balance
    const account = accounts.find(a => a.id === transaction.accountId);
    if (account) {
      let cashChange = 0;
      if (transaction.action === 'sell-to-open') {
        cashChange = transaction.totalPremium - transaction.fees;
        // Reserve collateral if applicable
        if (transaction.collateralRequired) {
          cashChange -= transaction.collateralRequired;
        }
      } else if (transaction.action === 'buy-to-open') {
        cashChange = -(transaction.totalPremium + transaction.fees);
      } else if (transaction.action === 'buy-to-close') {
        cashChange = -(transaction.totalPremium + transaction.fees);
        // Release collateral if closing a sold position
        if (transaction.collateralRequired && transaction.collateralReleased) {
          cashChange += transaction.collateralRequired;
        }
      } else if (transaction.action === 'sell-to-close') {
        cashChange = transaction.totalPremium - transaction.fees;
      }
      
      updateAccount(account.id, {
        currentCash: account.currentCash + cashChange
      });
    }
  };
  
  const updateOptionTransaction = (id: string, updates: Partial<OptionTransaction>) => {
    setOptionTransactions(optionTransactions.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteOptionTransaction = (id: string) => {
    setOptionTransactions(optionTransactions.filter(t => t.id !== id));
  };
  
  // Tag actions
  const addTag = (tag: Omit<Tag, 'id'>) => {
    const newTag: Tag = {
      ...tag,
      id: generateId()
    };
    setTags([...tags, newTag]);
  };
  
  const updateTag = (id: string, updates: Partial<Tag>) => {
    setTags(tags.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteTag = (id: string) => {
    setTags(tags.filter(t => t.id !== id));
  };
  
  // Template actions
  const addTemplate = (template: Omit<TransactionTemplate, 'id'>) => {
    const newTemplate: TransactionTemplate = {
      ...template,
      id: generateId()
    };
    setTemplates([...templates, newTemplate]);
  };
  
  const updateTemplate = (id: string, updates: Partial<TransactionTemplate>) => {
    setTemplates(templates.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteTemplate = (id: string) => {
    setTemplates(templates.filter(t => t.id !== id));
  };
  
  // Settings actions
  const updateSettings = (updates: Partial<AppSettings>) => {
    setSettings({ ...settings, ...updates });
  };
  
  // Data management
  const loadMockData = () => {
    const mockData = generateMockData();
    setAccounts(mockData.accounts);
    setStockTransactions(mockData.stockTransactions);
    setOptionTransactions(mockData.optionTransactions);
    setTags(mockData.tags);
    setTemplates(mockData.templates);
    setSelectedAccountId(null);
  };
  
  const clearAllData = () => {
    setAccounts([]);
    setStockTransactions([]);
    setOptionTransactions([]);
    setTags([]);
    setTemplates([]);
    setSettings(defaultSettings);
    setSelectedAccountId(null);
  };
  
  const exportData = (): string => {
    const dataToExport = {
      accounts,
      stockTransactions,
      optionTransactions,
      tags,
      templates,
      settings,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    };
    return JSON.stringify(dataToExport, null, 2);
  };
  
  const importData = (jsonData: string): boolean => {
    try {
      const parsed = JSON.parse(jsonData);
      setAccounts(parsed.accounts || []);
      setStockTransactions(parsed.stockTransactions || []);
      setOptionTransactions(parsed.optionTransactions || []);
      setTags(parsed.tags || []);
      setTemplates(parsed.templates || []);
      if (parsed.settings) {
        setSettings({ ...defaultSettings, ...parsed.settings });
      }
      return true;
    } catch (error) {
      console.error('Failed to import data:', error);
      return false;
    }
  };
  
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
    importData
  };
  
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useAppContext = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
