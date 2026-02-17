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
import { detectStockWashSales, detectWashSales } from '../utils/positionCalculations';

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
    
    // Check for wash sale on ANY stock transaction (buy or sell)
    // Wash sale: selling at a loss and buying same stock within 30 days
    // Need to check both directions:
    // - When selling: did I sell at a loss with buys nearby?
    // - When buying: was there a recent sell at a loss?
    const allStockTxns = [...stockTransactions, newTransaction];
    const washSaleInfo = detectStockWashSales(allStockTxns, newTransaction.id);
    
    if (washSaleInfo && washSaleInfo.hasWashSale) {
      if (transaction.action === 'buy') {
        alert(
          `⚠️ Potential Wash Sale Detected\n\n` +
          `You are buying ${transaction.ticker} within 30 days of selling it at a loss of $${washSaleInfo.lossAmount.toFixed(2)}.\n\n` +
          `This may trigger wash sale rules, which could disallow the loss deduction for tax purposes.\n\n` +
          `The transaction has been added, but please consult a tax professional.`
        );
      } else if (transaction.action === 'sell') {
        alert(
          `⚠️ Potential Wash Sale Detected\n\n` +
          `You sold ${transaction.ticker} at a loss of $${washSaleInfo.lossAmount.toFixed(2)}.\n\n` +
          `You have ${washSaleInfo.relatedTransactionIds.length} related buy transaction(s) within 30 days.\n\n` +
          `This may trigger wash sale rules, which could disallow the loss deduction for tax purposes.`
        );
      }
    }
    
    return newTransaction.id;
  }, [stockTransactions]);
  
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
    closePrice?: number, // price per share for buy-to-close / sell-to-close
    fees?: number, // fees for closing transaction
    contractsToClose?: number // number of contracts to close (for partial close)
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
    
    console.log('=== CLOSE POSITION DEBUG ===');
    console.log('Position:', position);
    console.log('Open transaction:', openTxn);
    console.log('Is seller?', isSeller);
    console.log('Closing action:', closingAction);
    console.log('Close type:', closeType);
    
    // Determine how many contracts to close
    const contractsClosing = contractsToClose || position.contracts;
    if (contractsClosing > position.contracts) {
      console.error('Cannot close more contracts than available');
      return;
    }
    
    // Calculate realized P&L
    const closeFees = fees || 0;
    let realizedPL = 0;
    let closePremiumPerShare = closePrice || 0;
    let closeTotalPremium = closePremiumPerShare * contractsClosing * 100;
    
    // Calculate proportional open premium and fees
    const proportionClosing = contractsClosing / openTxn.contracts;
    const proportionalOpenPremium = openTxn.totalPremium * proportionClosing;
    const proportionalOpenFees = openTxn.fees * proportionClosing;
    
    if (closeType === 'expired') {
      // Option expired worthless
      closePremiumPerShare = 0;
      closeTotalPremium = 0;
      if (isSeller) {
        // Seller keeps proportional premium
        realizedPL = proportionalOpenPremium - proportionalOpenFees;
      } else {
        // Buyer loses proportional premium
        realizedPL = -(proportionalOpenPremium + proportionalOpenFees);
      }
    } else if (closeType === 'assigned') {
      // Option was assigned - premium already received/paid, now stock changes hands
      closePremiumPerShare = 0;
      closeTotalPremium = 0;
      if (isSeller) {
        // Seller keeps the proportional premium received at open
        realizedPL = proportionalOpenPremium - proportionalOpenFees;
      } else {
        // Buyer paid proportional premium to open, now exercises
        realizedPL = -(proportionalOpenPremium + proportionalOpenFees);
      }
    } else {
      // Closed manually (bought/sold to close)
      if (isSeller) {
        // Sold to open, bought to close
        // P&L = proportional premium received - premium paid to close - proportional open fees - close fees
        realizedPL = proportionalOpenPremium - closeTotalPremium - proportionalOpenFees - closeFees;
      } else {
        // Bought to open, sold to close
        // P&L = premium received on close - proportional premium paid to open - proportional open fees - close fees
        realizedPL = closeTotalPremium - proportionalOpenPremium - proportionalOpenFees - closeFees;
      }
    }
    
    // Create the closing option transaction
    console.log('Creating closing transaction with action:', closingAction);
    const closingOptionTxn: Omit<OptionTransaction, 'id'> = {
      accountId: position.accountId,
      ticker: position.ticker,
      optionType: position.optionType,
      strikePrice: position.strikePrice,
      expirationDate: position.expirationDate,
      action: closingAction as OptionTransaction['action'],
      contracts: contractsClosing,
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
        ? `${contractsClosing} contract(s) expired worthless`
        : closeType === 'assigned'
          ? `${contractsClosing} contract(s) assigned - ${position.optionType === 'put' ? 'bought' : 'sold'} ${contractsClosing * 100} shares of ${position.ticker} at $${position.strikePrice}`
          : `Closed ${contractsClosing} contract(s) at $${closePremiumPerShare}/share`
    };
    
    // Add the closing option transaction (this handles cash for the premium)
    console.log('Closing transaction object:', closingOptionTxn);
    const newTxnId = addOptionTransaction(closingOptionTxn);
    console.log('New transaction ID:', newTxnId);
    
    // Check for wash sale if this was a loss
    if (realizedPL < 0) {
      const allTransactions = [...optionTransactions, { ...closingOptionTxn, id: newTxnId }];
      const washSaleInfo = detectWashSales(allTransactions, newTxnId);
      
      if (washSaleInfo && washSaleInfo.hasWashSale) {
        alert(
          `⚠️ Potential Wash Sale Detected\n\n` +
          `You closed ${position.ticker} at a loss of $${Math.abs(realizedPL).toFixed(2)}.\n\n` +
          `You have ${washSaleInfo.relatedTransactionIds.length} related transaction(s) within 30 days before/after this sale.\n\n` +
          `This may trigger wash sale rules, which could disallow the loss deduction for tax purposes.`
        );
      }
    }
    
    // If ASSIGNED, create the corresponding stock transaction
    if (closeType === 'assigned') {
      const sharesCount = contractsClosing * 100;
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
            notes: `Assigned from ${position.strategy}: ${contractsClosing} put contract(s) at $${position.strikePrice} strike`
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
            notes: `Assigned from ${position.strategy}: ${contractsClosing} call contract(s) at $${position.strikePrice} strike`
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
