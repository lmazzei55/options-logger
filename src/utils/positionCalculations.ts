/**
 * Enhanced position calculation utilities
 * Fixes Priority 2.3: Position calculation issues with partial closes
 * Fixes Priority 2.4: Wash sale detection
 * Fixes Priority 2.5: Realized P/L validation
 */

import type { OptionTransaction, OptionPosition } from '../types';

export interface PositionUpdate {
  positionId: string;
  remainingContracts: number;
  realizedPL: number;
  isClosed: boolean;
}

export interface WashSaleInfo {
  transactionId: string;
  ticker: string;
  lossAmount: number;
  washSalePeriodStart: Date;
  washSalePeriodEnd: Date;
  hasWashSale: boolean;
  relatedTransactionIds: string[];
}

/**
 * Calculate the effect of a closing transaction on existing positions
 * Handles partial closes correctly using FIFO (First In, First Out)
 */
export function calculatePartialClose(
  closingTransaction: OptionTransaction,
  openPositions: OptionPosition[]
): PositionUpdate[] {
  const updates: PositionUpdate[] = [];
  
  // Filter positions that match the closing transaction
  const matchingPositions = openPositions.filter(pos => 
    pos.ticker === closingTransaction.ticker &&
    pos.optionType === closingTransaction.optionType &&
    pos.strikePrice === closingTransaction.strikePrice &&
    pos.expirationDate === closingTransaction.expirationDate &&
    pos.status === 'open'
  ).sort((a, b) => new Date(a.openDate).getTime() - new Date(b.openDate).getTime()); // FIFO
  
  let contractsToClose = closingTransaction.contracts;
  
  for (const position of matchingPositions) {
    if (contractsToClose <= 0) break;
    
    const contractsClosed = Math.min(contractsToClose, position.contracts);
    const remainingContracts = position.contracts - contractsClosed;
    
    // Calculate realized P/L for this portion
    const openPremium = position.totalPremium / position.contracts * contractsClosed;
    const closePremium = closingTransaction.totalPremium / closingTransaction.contracts * contractsClosed;
    const openFees = 0; // Fees are included in totalPremium for positions
    const closeFees = (closingTransaction.fees || 0) / closingTransaction.contracts * contractsClosed;
    
    let realizedPL: number;
    // Determine if position was opened with sell or buy based on strategy
    // For now, we'll need to look up the opening transaction
    // Simplified: assume if totalPremium is positive, it was sell-to-open
    const wasSellToOpen = position.totalPremium > 0;
    if (wasSellToOpen) {
      // Sold to open, buying to close
      realizedPL = openPremium - closePremium - openFees - closeFees;
    } else {
      // Bought to open, selling to close
      realizedPL = closePremium - openPremium - openFees - closeFees;
    }
    
    updates.push({
      positionId: position.id,
      remainingContracts,
      realizedPL,
      isClosed: remainingContracts === 0
    });
    
    contractsToClose -= contractsClosed;
  }
  
  return updates;
}

/**
 * Detect potential wash sales
 * A wash sale occurs when you sell a security at a loss and buy a substantially identical
 * security within 30 days before or after the sale
 */
/**
 * Detect potential wash sales for stock transactions.
 * Checks BOTH directions:
 * 1. When SELLING at a loss: checks for buys within 30 days before/after
 * 2. When BUYING: checks if there was a sell at a loss within 30 days before/after
 */
export function detectStockWashSales(
  transactions: any[], // StockTransaction type
  targetTransactionId: string
): WashSaleInfo | null {
  const targetTxn = transactions.find((t: any) => t.id === targetTransactionId);
  if (!targetTxn) return null;
  
  const targetDate = new Date(targetTxn.date || targetTxn.transactionDate);
  const washStart = new Date(targetDate);
  washStart.setDate(washStart.getDate() - 30);
  const washEnd = new Date(targetDate);
  washEnd.setDate(washEnd.getDate() + 30);
  
  // Case 1: User is BUYING - check if there was a recent sell at a loss for the same ticker
  if (targetTxn.action === 'buy') {
    // Find sell transactions for the same ticker within the wash sale window
    const recentSells = transactions.filter((t: any) => {
      if (t.id === targetTransactionId) return false;
      if (t.ticker !== targetTxn.ticker) return false;
      if (t.action !== 'sell') return false;
      const txnDate = new Date(t.date || t.transactionDate);
      return txnDate >= washStart && txnDate <= washEnd;
    });
    
    // For each sell, check if it was at a loss
    for (const sellTxn of recentSells) {
      // Find buys before this sell to determine cost basis
      const priorBuys = transactions
        .filter((t: any) => 
          t.ticker === sellTxn.ticker &&
          t.action === 'buy' &&
          t.id !== targetTransactionId &&
          new Date(t.date || t.transactionDate) < new Date(sellTxn.date || sellTxn.transactionDate)
        )
        .sort((a: any, b: any) => new Date(b.date || b.transactionDate).getTime() - new Date(a.date || a.transactionDate).getTime());
      
      if (priorBuys.length > 0) {
        const costBasis = priorBuys[0].pricePerShare * priorBuys[0].shares;
        const saleProceeds = sellTxn.pricePerShare * sellTxn.shares;
        const loss = saleProceeds - costBasis;
        
        if (loss < 0) {
          return {
            transactionId: targetTransactionId,
            ticker: targetTxn.ticker,
            lossAmount: Math.abs(loss),
            washSalePeriodStart: washStart,
            washSalePeriodEnd: washEnd,
            hasWashSale: true,
            relatedTransactionIds: [sellTxn.id]
          };
        }
      }
    }
    
    return null;
  }
  
  // Case 2: User is SELLING - check if this is a loss and if there are buys within 30 days
  if (targetTxn.action === 'sell') {
    // Find the most recent buy before this sell to determine cost basis
    const priorBuys = transactions
      .filter((t: any) => 
        t.ticker === targetTxn.ticker &&
        t.action === 'buy' &&
        new Date(t.date || t.transactionDate) < targetDate
      )
      .sort((a: any, b: any) => new Date(b.date || b.transactionDate).getTime() - new Date(a.date || a.transactionDate).getTime());
    
    if (priorBuys.length === 0) return null;
    
    const costBasis = priorBuys[0].pricePerShare * priorBuys[0].shares;
    const saleProceeds = targetTxn.pricePerShare * targetTxn.shares;
    const loss = saleProceeds - costBasis;
    
    if (loss >= 0) return null; // No loss, no wash sale
    
    // Find buy transactions within the wash sale window
    const relatedBuys = transactions.filter((t: any) => {
      if (t.id === targetTransactionId) return false;
      if (t.ticker !== targetTxn.ticker) return false;
      if (t.action !== 'buy') return false;
      const txnDate = new Date(t.date || t.transactionDate);
      return txnDate >= washStart && txnDate <= washEnd;
    });
    
    if (relatedBuys.length === 0) return null;
    
    return {
      transactionId: targetTransactionId,
      ticker: targetTxn.ticker,
      lossAmount: Math.abs(loss),
      washSalePeriodStart: washStart,
      washSalePeriodEnd: washEnd,
      hasWashSale: true,
      relatedTransactionIds: relatedBuys.map((t: any) => t.id)
    };
  }
  
  return null;
}

/**
 * Detect potential wash sales for option transactions
 */
export function detectWashSales(
  transactions: OptionTransaction[],
  targetTransactionId: string
): WashSaleInfo | null {
  const targetTxn = transactions.find(t => t.id === targetTransactionId);
  if (!targetTxn) return null;
  
  // Only check closing transactions that result in a loss
  if (!['buy-to-close', 'sell-to-close'].includes(targetTxn.action)) {
    return null;
  }
  
  // Check if this transaction resulted in a loss
  const realizedPL = targetTxn.realizedPL || 0;
  if (realizedPL >= 0) {
    // No loss, no wash sale
    return null;
  }
  
  const targetDate = new Date(targetTxn.transactionDate);
  const washSalePeriodStart = new Date(targetDate);
  washSalePeriodStart.setDate(washSalePeriodStart.getDate() - 30);
  const washSalePeriodEnd = new Date(targetDate);
  washSalePeriodEnd.setDate(washSalePeriodEnd.getDate() + 30);
  
  // Find related opening transactions within the wash sale period
  const relatedTransactions = transactions.filter(t => {
    if (t.id === targetTransactionId) return false;
    if (t.ticker !== targetTxn.ticker) return false;
    if (t.optionType !== targetTxn.optionType) return false;
    
    const txnDate = new Date(t.transactionDate);
    if (txnDate < washSalePeriodStart || txnDate > washSalePeriodEnd) return false;
    
    // Check if it's an opening transaction
    return ['buy-to-open', 'sell-to-open'].includes(t.action);
  });
  
  // For now, we'll mark it as a potential wash sale if there are related transactions
  // A full implementation would need to calculate the actual loss and determine if it's disallowed
  const hasWashSale = relatedTransactions.length > 0;
  
  return {
    transactionId: targetTransactionId,
    ticker: targetTxn.ticker,
    lossAmount: Math.abs(realizedPL),
    washSalePeriodStart,
    washSalePeriodEnd,
    hasWashSale,
    relatedTransactionIds: relatedTransactions.map(t => t.id)
  };
}

/**
 * Validate that a closing transaction makes sense given existing positions
 */
export function validateClosingTransaction(
  closingTransaction: OptionTransaction,
  openPositions: OptionPosition[]
): { valid: boolean; error?: string; warning?: string } {
  // Check if action is a closing action
  if (!['buy-to-close', 'sell-to-close'].includes(closingTransaction.action)) {
    return { valid: true }; // Not a closing transaction, no validation needed
  }
  
  // Find matching open positions
  const matchingPositions = openPositions.filter(pos => 
    pos.ticker === closingTransaction.ticker &&
    pos.optionType === closingTransaction.optionType &&
    pos.strikePrice === closingTransaction.strikePrice &&
    pos.expirationDate === closingTransaction.expirationDate &&
    pos.status === 'open'
  );
  
  const totalOpenContracts = matchingPositions.reduce((sum, pos) => sum + pos.contracts, 0);
  
  // Check if we have enough open contracts
  if (totalOpenContracts === 0) {
    return {
      valid: false,
      error: `Cannot close ${closingTransaction.contracts} contracts: No open position found for ${closingTransaction.ticker} ${closingTransaction.optionType} $${closingTransaction.strikePrice}`
    };
  }
  
  if (totalOpenContracts < closingTransaction.contracts) {
    return {
      valid: false,
      error: `Cannot close ${closingTransaction.contracts} contracts: Only ${totalOpenContracts} contracts are open`
    };
  }
  
  // Check action consistency
  // Determine opening action from position strategy
  const wasSellToOpen = matchingPositions[0].totalPremium > 0;
  const openingAction = wasSellToOpen ? 'sell-to-open' : 'buy-to-open';
  const expectedClosingAction = openingAction === 'sell-to-open' ? 'buy-to-close' : 'sell-to-close';
  
  if (closingTransaction.action !== expectedClosingAction) {
    return {
      valid: true,
      warning: `Position was opened with ${openingAction} but closing with ${closingTransaction.action}. This may indicate an error.`
    };
  }
  
  return { valid: true };
}

/**
 * Calculate realized P/L for a completed position
 */
export function calculateRealizedPL(
  openTransaction: OptionTransaction,
  closeTransaction: OptionTransaction
): number {
  if (openTransaction.action === 'sell-to-open') {
    // Sold to open, bought to close
    // Profit if close price < open price
    return (
      openTransaction.totalPremium - 
      closeTransaction.totalPremium - 
      (openTransaction.fees || 0) - 
      (closeTransaction.fees || 0)
    );
  } else {
    // Bought to open, sold to close
    // Profit if close price > open price
    return (
      closeTransaction.totalPremium - 
      openTransaction.totalPremium - 
      (openTransaction.fees || 0) - 
      (closeTransaction.fees || 0)
    );
  }
}
