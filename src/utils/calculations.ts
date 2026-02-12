import type {
  StockTransaction,
  OptionTransaction,
  StockPosition,
  OptionPosition,
  InvestmentAccount,
  PortfolioSummary,
  OptionsAnalytics,
  StockAnalytics
} from '../types';

// Generate unique IDs
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Calculate stock positions from transactions
export const calculateStockPositions = (
  transactions: StockTransaction[],
  accountId?: string
): StockPosition[] => {
  const filteredTransactions = accountId
    ? transactions.filter(t => t.accountId === accountId)
    : transactions;

  const positionMap = new Map<string, StockPosition>();

  // Sort transactions by date
  const sortedTransactions = [...filteredTransactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  sortedTransactions.forEach(transaction => {
    const key = `${transaction.accountId}-${transaction.ticker}`;
    const existing = positionMap.get(key);

    if (!existing) {
      // New position
      if (transaction.action === 'buy' || transaction.action === 'transfer-in') {
        positionMap.set(key, {
          ticker: transaction.ticker,
          accountId: transaction.accountId,
          shares: transaction.shares,
          averageCostBasis: transaction.pricePerShare,
          totalCostBasis: transaction.totalAmount,
          firstPurchaseDate: transaction.date,
          lastTransactionDate: transaction.date,
          transactionIds: [transaction.id]
        });
      }
    } else {
      // Update existing position
      const updatedTransactionIds = [...existing.transactionIds, transaction.id];
      
      if (transaction.action === 'buy' || transaction.action === 'transfer-in') {
        const newShares = existing.shares + transaction.shares;
        const newTotalCost = existing.totalCostBasis + transaction.totalAmount;
        const newAvgCost = newTotalCost / newShares;

        positionMap.set(key, {
          ...existing,
          shares: newShares,
          averageCostBasis: newAvgCost,
          totalCostBasis: newTotalCost,
          lastTransactionDate: transaction.date,
          transactionIds: updatedTransactionIds
        });
      } else if (transaction.action === 'sell' || transaction.action === 'transfer-out') {
        const newShares = existing.shares - transaction.shares;
        const costReduction = existing.averageCostBasis * transaction.shares;
        const newTotalCost = existing.totalCostBasis - costReduction;

        if (newShares > 0) {
          positionMap.set(key, {
            ...existing,
            shares: newShares,
            totalCostBasis: newTotalCost,
            lastTransactionDate: transaction.date,
            transactionIds: updatedTransactionIds
          });
        } else {
          // Position closed
          positionMap.delete(key);
        }
      } else if (transaction.action === 'split' && transaction.splitRatio) {
        // Handle stock split
        const [newShares, oldShares] = transaction.splitRatio.split(':').map(Number);
        const splitMultiplier = newShares / oldShares;
        
        positionMap.set(key, {
          ...existing,
          shares: existing.shares * splitMultiplier,
          averageCostBasis: existing.averageCostBasis / splitMultiplier,
          lastTransactionDate: transaction.date,
          transactionIds: updatedTransactionIds
        });
      }
    }
  });

  return Array.from(positionMap.values());
};

// Calculate option positions from transactions
export const calculateOptionPositions = (
  transactions: OptionTransaction[],
  accountId?: string
): OptionPosition[] => {
  const filteredTransactions = accountId
    ? transactions.filter(t => t.accountId === accountId)
    : transactions;

  // const positions: OptionPosition[] = [];
  const positionMap = new Map<string, OptionPosition>();

  // Sort transactions by date
  const sortedTransactions = [...filteredTransactions].sort(
    (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
  );

  sortedTransactions.forEach(transaction => {
    const key = `${transaction.accountId}-${transaction.ticker}-${transaction.strikePrice}-${transaction.expirationDate}-${transaction.optionType}`;

    if (transaction.action === 'sell-to-open' || transaction.action === 'buy-to-open') {
      // Opening transaction
      const existing = positionMap.get(key);
      
      if (!existing) {
        positionMap.set(key, {
          id: transaction.id,
          ticker: transaction.ticker,
          accountId: transaction.accountId,
          strategy: transaction.strategy,
          optionType: transaction.optionType,
          contracts: transaction.contracts,
          strikePrice: transaction.strikePrice,
          expirationDate: transaction.expirationDate,
          averagePremium: transaction.premiumPerShare,
          totalPremium: transaction.totalPremium,
          status: transaction.status,
          collateralRequired: transaction.collateralRequired,
          transactionIds: [transaction.id],
          openDate: transaction.transactionDate,
          closeDate: transaction.closeDate,
          realizedPL: transaction.realizedPL
        });
      } else {
        // Add to existing position
        const totalContracts = existing.contracts + transaction.contracts;
        const totalPremium = existing.totalPremium + transaction.totalPremium;
        const avgPremium = totalPremium / (totalContracts * 100);

        positionMap.set(key, {
          ...existing,
          contracts: totalContracts,
          totalPremium: totalPremium,
          averagePremium: avgPremium,
          transactionIds: [...existing.transactionIds, transaction.id]
        });
      }
    } else if (transaction.action === 'buy-to-close' || transaction.action === 'sell-to-close') {
      // Closing transaction
      const existing = positionMap.get(key);
      
      if (existing) {
        const remainingContracts = existing.contracts - transaction.contracts;
        
        if (remainingContracts <= 0) {
          // Position fully closed
          positionMap.set(key, {
            ...existing,
            contracts: 0,
            status: transaction.status,
            closeDate: transaction.transactionDate,
            realizedPL: transaction.realizedPL,
            transactionIds: [...existing.transactionIds, transaction.id]
          });
        } else {
          // Partial close
          positionMap.set(key, {
            ...existing,
            contracts: remainingContracts,
            transactionIds: [...existing.transactionIds, transaction.id]
          });
        }
      }
    }
  });

  // Filter out fully closed positions and return
  return Array.from(positionMap.values()).filter(p => p.contracts > 0 || p.status !== 'closed');
};

// Calculate portfolio summary
export const calculatePortfolioSummary = (
  accounts: InvestmentAccount[],
  stockPositions: StockPosition[],
  optionPositions: OptionPosition[],
  accountId?: string
): PortfolioSummary => {
  const filteredAccounts = accountId
    ? accounts.filter(a => a.id === accountId)
    : accounts;

  // Total cash in all accounts (premium already added, stock purchases already deducted)
  const totalCash = filteredAccounts.reduce((sum, acc) => sum + acc.currentCash, 0);
  
  // Active collateral = cash reserved for open option positions
  // This is NOT subtracted from cash in our model - it's just "reserved"
  const activeCollateral = optionPositions
    .filter(p => p.status === 'open')
    .reduce((sum, p) => sum + (p.collateralRequired || 0), 0);
  
  // Available cash = total cash minus collateral reserved
  const availableCash = totalCash - activeCollateral;
  
  // Stock value = market value if available, otherwise cost basis
  const stockValue = stockPositions.reduce((sum, pos) => {
    return sum + (pos.marketValue || pos.totalCostBasis);
  }, 0);

  // Option premium value: for open positions, this represents the premium received/paid
  // that hasn't been realized yet. Since premium is already in cash, we DON'T add it again.
  // Instead, optionPremiumValue represents the net unrealized option value (0 without live pricing)
  const optionPremiumValue = 0; // Without live pricing, we can't value open options

  // Total portfolio value = cash + stock value
  // Cash already includes premiums received and has stock purchases deducted
  const totalValue = totalCash + stockValue;
  
  // Total invested = cost basis of current stock positions
  const totalInvested = stockPositions.reduce((sum, pos) => sum + pos.totalCostBasis, 0);
  
  // Total initial capital = sum of initial cash across all accounts
  const totalInitialCapital = filteredAccounts.reduce((sum, acc) => sum + acc.initialCash, 0);
  
  // P&L = current total value - initial capital
  const totalPL = totalValue - totalInitialCapital;
  const totalPLPercent = totalInitialCapital > 0 ? (totalPL / totalInitialCapital) * 100 : 0;

  return {
    totalValue,
    totalCash,
    availableCash,
    activeCollateral,
    totalInvested,
    totalPL,
    totalPLPercent,
    stockValue,
    optionPremiumValue
  };
};

// Calculate options analytics
export const calculateOptionsAnalytics = (
  transactions: OptionTransaction[],
  positions: OptionPosition[],
  accountId?: string
): OptionsAnalytics => {
  const filteredTransactions = accountId
    ? transactions.filter(t => t.accountId === accountId)
    : transactions;

  // const openTransactions = filteredTransactions.filter(
  //   t => t.action === 'sell-to-open' || t.action === 'buy-to-open'
  // );

  const totalPremiumCollected = filteredTransactions
    .filter(t => t.action === 'sell-to-open')
    .reduce((sum, t) => sum + t.totalPremium, 0);

  const totalPremiumPaid = filteredTransactions
    .filter(t => t.action === 'buy-to-open')
    .reduce((sum, t) => sum + t.totalPremium, 0);

  // Include closing costs: buy-to-close costs and sell-to-close proceeds
  const totalClosingCosts = filteredTransactions
    .filter(t => t.action === 'buy-to-close')
    .reduce((sum, t) => sum + t.totalPremium, 0);

  const totalClosingProceeds = filteredTransactions
    .filter(t => t.action === 'sell-to-close')
    .reduce((sum, t) => sum + t.totalPremium, 0);

  // Net premium = premiums collected from selling - premiums paid for buying - closing costs + closing proceeds
  const netPremium = totalPremiumCollected - totalPremiumPaid - totalClosingCosts + totalClosingProceeds;

  const closedTransactions = filteredTransactions.filter(
    t => t.status === 'closed' || t.status === 'expired' || t.status === 'assigned'
  );

  const profitableCount = closedTransactions.filter(
    t => (t.realizedPL || 0) > 0
  ).length;

  const winRate = closedTransactions.length > 0
    ? (profitableCount / closedTransactions.length) * 100
    : 0;

  const totalRealizedPL = closedTransactions.reduce(
    (sum, t) => sum + (t.realizedPL || 0),
    0
  );

  const averageReturnPerTrade = closedTransactions.length > 0
    ? totalRealizedPL / closedTransactions.length
    : 0;

  const assignedCount = filteredTransactions.filter(
    t => t.status === 'assigned'
  ).length;

  const assignmentRate = closedTransactions.length > 0
    ? (assignedCount / closedTransactions.length) * 100
    : 0;

  const daysToClose = closedTransactions
    .filter(t => t.closeDate)
    .map(t => {
      const open = new Date(t.transactionDate).getTime();
      const close = new Date(t.closeDate!).getTime();
      return (close - open) / (1000 * 60 * 60 * 24);
    });

  const averageDaysToClose = daysToClose.length > 0
    ? daysToClose.reduce((sum, days) => sum + days, 0) / daysToClose.length
    : 0;

  const activeCollateral = positions
    .filter(p => p.status === 'open')
    .reduce((sum, p) => sum + (p.collateralRequired || 0), 0);

  const totalCollateral = filteredTransactions
    .filter(t => t.collateralRequired)
    .reduce((sum, t) => sum + (t.collateralRequired || 0), 0);

  const collateralEfficiency = totalCollateral > 0
    ? (totalPremiumCollected / totalCollateral) * 100
    : 0;

  const projectedPremium = positions
    .filter(p => p.status === 'open')
    .reduce((sum, p) => sum + p.totalPremium, 0);

  // Calculate annualized return: use per-trade annualized returns averaged
  const perTradeReturns = closedTransactions
    .filter(t => t.collateralRequired && t.collateralRequired > 0 && t.closeDate)
    .map(t => {
      const days = Math.max(1, Math.round(
        (new Date(t.closeDate!).getTime() - new Date(t.transactionDate).getTime()) / (1000 * 60 * 60 * 24)
      ));
      const returnPct = ((t.realizedPL || 0) / t.collateralRequired!) * (365 / days) * 100;
      return returnPct;
    });

  const annualizedReturn = perTradeReturns.length > 0
    ? perTradeReturns.reduce((sum, r) => sum + r, 0) / perTradeReturns.length
    : 0;

  return {
    totalPremiumCollected,
    totalPremiumPaid,
    netPremium,
    winRate,
    averageReturnPerTrade,
    annualizedReturn,
    assignmentRate,
    averageDaysToClose,
    collateralEfficiency,
    activeCollateral,
    projectedPremium
  };
};

// Calculate stock analytics
export const calculateStockAnalytics = (
  transactions: StockTransaction[],
  positions: StockPosition[],
  accountId?: string
): StockAnalytics => {
  const filteredPositions = accountId
    ? positions.filter(p => p.accountId === accountId)
    : positions;

  const totalStockValue = filteredPositions.reduce(
    (sum, p) => sum + (p.marketValue || p.totalCostBasis),
    0
  );

  const totalCostBasis = filteredPositions.reduce(
    (sum, p) => sum + p.totalCostBasis,
    0
  );

  const totalUnrealizedPL = filteredPositions.reduce(
    (sum, p) => sum + (p.unrealizedPL || 0),
    0
  );

  // Calculate realized P&L from closed positions
  const filteredTransactions = accountId
    ? transactions.filter(t => t.accountId === accountId)
    : transactions;

  // Calculate realized P&L using volume-weighted average cost basis
  const sellTransactions = filteredTransactions.filter(t => t.action === 'sell');
  const totalRealizedPL = sellTransactions.reduce((sum, sell) => {
    // Find corresponding buy transactions for same ticker and account
    const buys = filteredTransactions.filter(
      t => t.ticker === sell.ticker && t.accountId === sell.accountId && t.action === 'buy' && t.date <= sell.date
    );
    
    if (buys.length > 0) {
      // Use volume-weighted average cost basis
      const totalBuyShares = buys.reduce((s, b) => s + b.shares, 0);
      const totalBuyCost = buys.reduce((s, b) => s + (b.pricePerShare * b.shares), 0);
      const weightedAvgPrice = totalBuyShares > 0 ? totalBuyCost / totalBuyShares : 0;
      const pl = (sell.pricePerShare - weightedAvgPrice) * sell.shares - (sell.fees || 0);
      return sum + pl;
    }
    
    return sum;
  }, 0);

  const holdingPeriods = filteredPositions.map(p => {
    const first = new Date(p.firstPurchaseDate).getTime();
    const today = new Date().getTime();
    return (today - first) / (1000 * 60 * 60 * 24);
  });

  const averageHoldingPeriod = holdingPeriods.length > 0
    ? holdingPeriods.reduce((sum, days) => sum + days, 0) / holdingPeriods.length
    : 0;

  return {
    totalStockValue,
    totalCostBasis,
    totalUnrealizedPL,
    totalRealizedPL,
    averageHoldingPeriod,
    positionCount: filteredPositions.length
  };
};

// Format currency
export const formatCurrency = (amount: number, currency = 'USD'): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// Format percentage
export const formatPercentage = (value: number, decimals = 2): string => {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
};

// Format date
export const formatDate = (date: string, format = 'short'): string => {
  const d = new Date(date);
  
  if (format === 'short') {
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
  
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
};

// Calculate days until expiration
export const daysUntilExpiration = (expirationDate: string): number => {
  const now = new Date().getTime();
  const expiration = new Date(expirationDate).getTime();
  return Math.ceil((expiration - now) / (1000 * 60 * 60 * 24));
};

// Calculate annualized return for a single option trade
export const calculateAnnualizedReturn = (
  premium: number,
  collateral: number,
  daysHeld: number
): number => {
  if (collateral === 0 || daysHeld === 0) return 0;
  return (premium / collateral) * (365 / daysHeld) * 100;
};
