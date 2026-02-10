import type {
  InvestmentAccount,
  StockTransaction,
  OptionTransaction,
  Tag,
  TransactionTemplate
} from '../types';
import { generateId } from './calculations';

export const generateMockData = () => {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  // Mock Accounts
  const accounts: InvestmentAccount[] = [
    {
      id: 'acc-1',
      name: 'Main Brokerage',
      type: 'brokerage',
      broker: 'Fidelity',
      accountNumber: '1234',
      initialCash: 50000,
      currentCash: 15420.50,
      currency: 'USD',
      isActive: true,
      createdDate: sixMonthsAgo.toISOString().split('T')[0],
      notes: 'Primary trading account'
    },
    {
      id: 'acc-2',
      name: 'Retirement IRA',
      type: 'retirement',
      broker: 'Vanguard',
      accountNumber: '5678',
      initialCash: 100000,
      currentCash: 25000,
      currency: 'USD',
      isActive: true,
      createdDate: sixMonthsAgo.toISOString().split('T')[0],
      notes: 'Long-term retirement savings'
    },
    {
      id: 'acc-3',
      name: 'Options Trading',
      type: 'margin',
      broker: 'Tastyworks',
      accountNumber: '9012',
      initialCash: 30000,
      currentCash: 8750.25,
      currency: 'USD',
      isActive: true,
      createdDate: sixMonthsAgo.toISOString().split('T')[0],
      notes: 'Dedicated options account'
    }
  ];

  // Mock Stock Transactions
  const stockTransactions: StockTransaction[] = [
    // AAPL positions
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      action: 'buy',
      shares: 100,
      pricePerShare: 175.50,
      totalAmount: 17550,
      fees: 0,
      date: new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Initial position'
    },
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      action: 'buy',
      shares: 50,
      pricePerShare: 182.25,
      totalAmount: 9112.50,
      fees: 0,
      date: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Added to position'
    },
    // MSFT position
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'MSFT',
      companyName: 'Microsoft Corporation',
      action: 'buy',
      shares: 75,
      pricePerShare: 380.00,
      totalAmount: 28500,
      fees: 0,
      date: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Tech diversification'
    },
    // TSLA position (sold)
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'TSLA',
      companyName: 'Tesla Inc.',
      action: 'buy',
      shares: 50,
      pricePerShare: 245.00,
      totalAmount: 12250,
      fees: 0,
      date: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Speculative play'
    },
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'TSLA',
      companyName: 'Tesla Inc.',
      action: 'sell',
      shares: 50,
      pricePerShare: 268.50,
      totalAmount: 13425,
      fees: 0,
      date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Took profits'
    },
    // SPY position in retirement account
    {
      id: generateId(),
      accountId: 'acc-2',
      ticker: 'SPY',
      companyName: 'SPDR S&P 500 ETF',
      action: 'buy',
      shares: 200,
      pricePerShare: 450.00,
      totalAmount: 90000,
      fees: 0,
      date: new Date(now.getTime() - 160 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Core holding'
    },
    // NVDA position
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'NVDA',
      companyName: 'NVIDIA Corporation',
      action: 'buy',
      shares: 100,
      pricePerShare: 485.00,
      totalAmount: 48500,
      fees: 0,
      date: new Date(now.getTime() - 80 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'AI play'
    }
  ];

  // Mock Option Transactions
  const optionTransactions: OptionTransaction[] = [
    // Open cash-secured put on AAPL
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'AAPL',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 2,
      strikePrice: 170.00,
      premiumPerShare: 3.50,
      totalPremium: 700,
      fees: 2,
      expirationDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open',
      collateralRequired: 34000,
      collateralReleased: false,
      notes: 'Weekly CSP'
    },
    // Expired worthless covered call
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'AAPL',
      strategy: 'covered-call',
      optionType: 'call',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 185.00,
      premiumPerShare: 2.25,
      totalPremium: 225,
      fees: 1,
      expirationDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'expired',
      closeDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      realizedPL: 224,
      notes: 'Expired worthless - kept premium'
    },
    // Closed profitable CSP on SPY
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'SPY',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 3,
      strikePrice: 445.00,
      premiumPerShare: 4.00,
      totalPremium: 1200,
      fees: 3,
      expirationDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'closed',
      closeDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      closePrice: 1.50,
      realizedPL: 747,
      collateralRequired: 133500,
      collateralReleased: true,
      notes: 'Closed early for 75% profit'
    },
    // Open covered call on MSFT
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'MSFT',
      strategy: 'covered-call',
      optionType: 'call',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 400.00,
      premiumPerShare: 5.50,
      totalPremium: 550,
      fees: 1.50,
      expirationDate: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open',
      notes: 'Monthly covered call'
    },
    // Assigned CSP on NVDA (resulted in stock purchase)
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'NVDA',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 485.00,
      premiumPerShare: 8.00,
      totalPremium: 800,
      fees: 2,
      expirationDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 81 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'assigned',
      closeDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      realizedPL: 798,
      collateralRequired: 48500,
      collateralReleased: true,
      linkedStockTransactionId: stockTransactions[stockTransactions.length - 1].id,
      notes: 'Assigned - acquired shares at strike'
    },
    // Long call on TSLA (before selling stock)
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'TSLA',
      strategy: 'long-call',
      optionType: 'call',
      action: 'buy-to-open',
      contracts: 2,
      strikePrice: 250.00,
      premiumPerShare: 12.50,
      totalPremium: 2500,
      fees: 2,
      expirationDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 105 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'closed',
      closeDate: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      closePrice: 18.00,
      realizedPL: 1098,
      notes: 'Sold for profit before expiration'
    },
    // Open CSP on SPY (expiring next week)
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'SPY',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 2,
      strikePrice: 455.00,
      premiumPerShare: 3.75,
      totalPremium: 750,
      fees: 2,
      expirationDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open',
      collateralRequired: 91000,
      collateralReleased: false,
      notes: 'Monthly SPY put'
    }
  ];

  // Mock Tags
  const tags: Tag[] = [
    {
      id: 'tag-1',
      name: 'High Conviction',
      color: '#10b981',
      type: 'both'
    },
    {
      id: 'tag-2',
      name: 'Speculative',
      color: '#f59e0b',
      type: 'both'
    },
    {
      id: 'tag-3',
      name: 'Income Strategy',
      color: '#3b82f6',
      type: 'option'
    },
    {
      id: 'tag-4',
      name: 'Hedge',
      color: '#ef4444',
      type: 'option'
    },
    {
      id: 'tag-5',
      name: 'Earnings Play',
      color: '#8b5cf6',
      type: 'both'
    }
  ];

  // Mock Templates
  const templates: TransactionTemplate[] = [
    {
      id: 'template-1',
      name: 'Weekly CSP on SPY',
      type: 'option',
      accountId: 'acc-3',
      ticker: 'SPY',
      strategy: 'cash-secured-put',
      optionType: 'put',
      contracts: 2,
      daysToExpiration: 7,
      notes: 'Weekly income strategy'
    },
    {
      id: 'template-2',
      name: 'Monthly CC on AAPL',
      type: 'option',
      accountId: 'acc-1',
      ticker: 'AAPL',
      strategy: 'covered-call',
      optionType: 'call',
      contracts: 1,
      daysToExpiration: 30,
      notes: 'Monthly covered call'
    },
    {
      id: 'template-3',
      name: 'Buy 100 shares',
      type: 'stock',
      accountId: 'acc-1',
      action: 'buy',
      shares: 100,
      notes: 'Standard lot purchase'
    }
  ];

  return {
    accounts,
    stockTransactions,
    optionTransactions,
    tags,
    templates
  };
};
