/**
 * Pure utility for planning option position closes.
 *
 * Returns a description of what should happen (closing txn, optional stock txn,
 * wash sale info) without executing any side effects. The context orchestrator
 * then applies these results.
 */

import type { OptionTransaction, StockTransaction } from '../types';
import { calculateOptionPositions } from './calculations';
import { detectWashSales } from './positionCalculations';

export interface OptionCloseParams {
  positionId: string;
  closeType: 'closed' | 'expired' | 'assigned';
  closePrice?: number;
  fees?: number;
  contractsToClose?: number;
}

export interface OptionCloseResult {
  closingOptionTxn: Omit<OptionTransaction, 'id'>;
  stockTxn?: Omit<StockTransaction, 'id'>;
  realizedPL: number;
}

/**
 * Plan the full effect of closing an option position. Pure function — no side effects.
 * Returns null if the position or opening transaction can't be found.
 */
export function planOptionClose(
  params: OptionCloseParams,
  optionTransactions: OptionTransaction[]
): OptionCloseResult | null {
  const { positionId, closeType, closePrice, fees, contractsToClose } = params;

  const position = calculateOptionPositions(optionTransactions).find(p => p.id === positionId);
  if (!position) return null;

  const openTxn = optionTransactions.find(t =>
    t.ticker === position.ticker &&
    t.strikePrice === position.strikePrice &&
    t.expirationDate === position.expirationDate &&
    t.accountId === position.accountId &&
    (t.action === 'sell-to-open' || t.action === 'buy-to-open')
  );
  if (!openTxn) return null;

  const today = new Date().toISOString().split('T')[0];
  const isSeller = openTxn.action === 'sell-to-open';
  const closingAction = isSeller ? 'buy-to-close' : 'sell-to-close';

  const contractsClosing = contractsToClose || position.contracts;
  if (contractsClosing > position.contracts) return null;

  const closeFees = fees || 0;
  let realizedPL = 0;
  let closePremiumPerShare = closePrice || 0;
  let closeTotalPremium = closePremiumPerShare * contractsClosing * 100;

  const proportionClosing = contractsClosing / openTxn.contracts;
  const proportionalOpenPremium = openTxn.totalPremium * proportionClosing;
  const proportionalOpenFees = openTxn.fees * proportionClosing;

  if (closeType === 'expired') {
    closePremiumPerShare = 0;
    closeTotalPremium = 0;
    realizedPL = isSeller
      ? proportionalOpenPremium - proportionalOpenFees
      : -(proportionalOpenPremium + proportionalOpenFees);
  } else if (closeType === 'assigned') {
    closePremiumPerShare = 0;
    closeTotalPremium = 0;
    realizedPL = isSeller
      ? proportionalOpenPremium - proportionalOpenFees
      : -(proportionalOpenPremium + proportionalOpenFees);
  } else {
    // Closed manually
    if (isSeller) {
      realizedPL = proportionalOpenPremium - closeTotalPremium - proportionalOpenFees - closeFees;
    } else {
      realizedPL = closeTotalPremium - proportionalOpenPremium - proportionalOpenFees - closeFees;
    }
  }

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
    realizedPL,
    collateralRequired: openTxn.collateralRequired,
    collateralReleased: true,
    notes: closeType === 'expired'
      ? `${contractsClosing} contract(s) expired worthless`
      : closeType === 'assigned'
        ? `${contractsClosing} contract(s) assigned - ${position.optionType === 'put' ? 'bought' : 'sold'} ${contractsClosing * 100} shares of ${position.ticker} at $${position.strikePrice}`
        : `Closed ${contractsClosing} contract(s) at $${closePremiumPerShare}/share`
  };

  // Build optional stock transaction for assignments
  let stockTxn: Omit<StockTransaction, 'id'> | undefined;
  if (closeType === 'assigned') {
    const sharesCount = contractsClosing * 100;
    const stockPrice = position.strikePrice;
    const stockTotal = sharesCount * stockPrice;

    if (position.optionType === 'put' && isSeller) {
      stockTxn = {
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
    } else if (position.optionType === 'call' && isSeller) {
      stockTxn = {
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
    }
  }

  return { closingOptionTxn, stockTxn, realizedPL };
}

/**
 * Check if a closing transaction triggers a wash sale.
 * Separated from planOptionClose so the caller can decide how to handle it.
 */
export function checkOptionWashSale(
  closingTxnId: string,
  closingTxn: Omit<OptionTransaction, 'id'>,
  existingTransactions: OptionTransaction[],
  realizedPL: number
): { hasWashSale: boolean; lossAmount: number; relatedCount: number } {
  if (realizedPL >= 0) {
    return { hasWashSale: false, lossAmount: 0, relatedCount: 0 };
  }

  const allTransactions = [...existingTransactions, { ...closingTxn, id: closingTxnId }];
  const washSaleInfo = detectWashSales(allTransactions, closingTxnId);

  if (washSaleInfo && washSaleInfo.hasWashSale) {
    return {
      hasWashSale: true,
      lossAmount: Math.abs(realizedPL),
      relatedCount: washSaleInfo.relatedTransactionIds.length
    };
  }

  return { hasWashSale: false, lossAmount: 0, relatedCount: 0 };
}
