import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
  addOptionTransaction: (transaction: Omit<OptionTransaction, 'id'>) => void;
  updateOptionTransaction: (id: string, transaction: Partial<OptionTransaction>) => void;
  deleteOptionTransaction: (id: string) => void;
  
  // Option assignment/exercise workflow
  closeOptionPosition: (
    positionId: string,
    closeType: 'closed' | 'expired' | 'assigned',
    closePrice?: number,
    fees?: number
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
    
    return newTransaction.id;
  }, []);
  
  const updateStockTransaction = (id: string, updates: Partial<StockTransaction>) => {
    setStockTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteStockTransaction = (id: string) => {
    setStockTransactions(prev => prev.filter(t => t.id !== id));
  };
  
  // ==========================================
  // OPTION TRANSACTION ACTIONS
  // ==========================================
  
  const addOptionTransaction = useCallback((transaction: Omit<OptionTransaction, 'id'>) => {
    const newTransaction: OptionTransaction = {
      ...transaction,
      id: generateId()
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
  }, []);
  
  const updateOptionTransaction = (id: string, updates: Partial<OptionTransaction>) => {
    setOptionTransactions(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };
  
  const deleteOptionTransaction = (id: string) => {
    setOptionTransactions(prev => prev.filter(t => t.id !== id));
  };
  
  // ==========================================
  // CLOSE OPTION POSITION (with proper downstream effects)
  // ==========================================
  
  const closeOptionPosition = useCallback((
    positionId: string,
    closeType: 'closed' | 'expired' | 'assigned',
    closePrice?: number, // price per share for buy-to-close / sell-to-close
    fees?: number // fees for closing transaction
  ) => {
    // We need current state, so we use functional updates
    // First, find the position and original transaction
    const position = calculateOptionPositions(optionTransactions).find(p => p.id === positionId);
    if (!position) return;
    
    const openTxn = optionTransactions.find(t =>
      t.ticker === position.ticker &&
      t.strikePrice === position.strikePrice &&
      t.expirationDate === position.expirationDate &&
      t.accountId === position.accountId &&
      (t.action === 'sell-to-open' || t.action === 'buy-to-open')
    );
    if (!openTxn) return;
    
    const today = new Date().toISOString().split('T')[0];
    const isSeller = openTxn.action === 'sell-to-open';
    const closingAction = isSeller ? 'buy-to-close' : 'sell-to-close';
    
    // Calculate realized P&L
    const closeFees = fees || 0;
    let realizedPL = 0;
    let closePremiumPerShare = closePrice || 0;
    let closeTotalPremium = closePremiumPerShare * position.contracts * 100;
    
    if (closeType === 'expired') {
      // Option expired worthless
      closePremiumPerShare = 0;
      closeTotalPremium = 0;
      if (isSeller) {
        // Seller keeps full premium
        realizedPL = openTxn.totalPremium - openTxn.fees;
      } else {
        // Buyer loses full premium
        realizedPL = -(openTxn.totalPremium + openTxn.fees);
      }
    } else if (closeType === 'assigned') {
      // Option was assigned - premium already received/paid, now stock changes hands
      closePremiumPerShare = 0;
      closeTotalPremium = 0;
      if (isSeller) {
        // Seller keeps the premium received at open
        realizedPL = openTxn.totalPremium - openTxn.fees;
      } else {
        // Buyer paid premium to open, now exercises
        realizedPL = -(openTxn.totalPremium + openTxn.fees);
      }
    } else {
      // Closed manually (bought/sold to close)
      if (isSeller) {
        // Sold to open, bought to close
        // P&L = premium received - premium paid to close - open fees - close fees
        realizedPL = openTxn.totalPremium - closeTotalPremium - openTxn.fees - closeFees;
      } else {
        // Bought to open, sold to close
        // P&L = premium received on close - premium paid to open - open fees - close fees
        realizedPL = closeTotalPremium - openTxn.totalPremium - openTxn.fees - closeFees;
      }
    }
    
    // Create the closing option transaction
    const closingOptionTxn: Omit<OptionTransaction, 'id'> = {
      accountId: position.accountId,
      ticker: position.ticker,
      optionType: position.optionType,
      strikePrice: position.strikePrice,
      expirationDate: position.expirationDate,
      action: closingAction as OptionTransaction['action'],
      contracts: position.contracts,
      premiumPerShare: closePremiumPerShare,
      totalPremium: closeTotalPremium,
      fees: closeFees,
      transactionDate: today,
      strategy: position.strategy,
      status: closeType,
      closeDate: today,
      realizedPL: realizedPL,
      collateralRequired: openTxn.collateralRequired,
      collateralReleased: true,
      notes: closeType === 'expired'
        ? 'Option expired worthless'
        : closeType === 'assigned'
          ? `Option was assigned - ${position.optionType === 'put' ? 'bought' : 'sold'} ${position.contracts * 100} shares of ${position.ticker} at $${position.strikePrice}`
          : `Position closed at $${closePremiumPerShare}/share`
    };
    
    // Add the closing option transaction (this handles cash for the premium)
    addOptionTransaction(closingOptionTxn);
    
    // If ASSIGNED, create the corresponding stock transaction
    if (closeType === 'assigned') {
      const sharesCount = position.contracts * 100;
      const stockPrice = position.strikePrice;
      const stockTotal = sharesCount * stockPrice;
      
      if (position.optionType === 'put') {
        // Put assigned = obligation to BUY stock at strike price
        // Whether you sold the put (CSP) or bought the put and exercised
        if (isSeller) {
          // CSP assigned: you must buy shares at strike
          const stockTxn: Omit<StockTransaction, 'id'> = {
            accountId: position.accountId,
            ticker: position.ticker,
            action: 'buy',
            shares: sharesCount,
            pricePerShare: stockPrice,
            totalAmount: stockTotal,
            fees: 0,
            date: today,
            notes: `Assigned from ${position.strategy}: ${position.contracts} put contract(s) at $${position.strikePrice} strike`
          };
          addStockTransaction(stockTxn);
        }
        // If buyer exercised a put, they sell shares (less common, skip for now)
      } else {
        // Call assigned
        if (isSeller) {
          // Covered call assigned: you must sell shares at strike
          const stockTxn: Omit<StockTransaction, 'id'> = {
            accountId: position.accountId,
            ticker: position.ticker,
            action: 'sell',
            shares: sharesCount,
            pricePerShare: stockPrice,
            totalAmount: stockTotal,
            fees: 0,
            date: today,
            notes: `Assigned from ${position.strategy}: ${position.contracts} call contract(s) at $${position.strikePrice} strike`
          };
          addStockTransaction(stockTxn);
        }
        // If buyer exercised a call, they buy shares
      }
    }
  }, [optionTransactions, addOptionTransaction, addStockTransaction]);
  
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
    return JSON.stringify({
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
