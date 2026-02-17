import type {
  StockPosition,
  OptionTransaction,
  OptionStrategy
} from '../types';

/**
 * Calculate premiums that should be applied to stock cost basis
 * Only includes premiums from covered calls and cash-secured puts (sell-to-open)
 */
export const calculateApplicablePremiums = (
  optionTransactions: OptionTransaction[],
  ticker: string,
  accountId: string
): number => {
  return optionTransactions
    .filter(t => 
      t.ticker === ticker &&
      t.accountId === accountId &&
      t.action === 'sell-to-open' &&
      (t.strategy === 'covered-call' || t.strategy === 'cash-secured-put')
    )
    .reduce((sum, t) => sum + t.totalPremium, 0);
};

/**
 * Apply premium adjustments to stock positions
 * This reduces the cost basis by premiums collected from covered calls and cash-secured puts
 */
export const applyPremiumAdjustments = (
  stockPositions: StockPosition[],
  optionTransactions: OptionTransaction[]
): StockPosition[] => {
  return stockPositions.map(position => {
    // Calculate total premiums applicable to this position
    const appliedPremiums = calculateApplicablePremiums(
      optionTransactions,
      position.ticker,
      position.accountId
    );

    if (appliedPremiums === 0) {
      // No premiums to apply, return position as-is
      return {
        ...position,
        premiumAdjustedCostBasis: position.averageCostBasis,
        premiumAdjustedTotalCost: position.totalCostBasis,
        appliedPremiums: 0
      };
    }

    // Calculate adjusted values
    const premiumAdjustedTotalCost = Math.max(0, position.totalCostBasis - appliedPremiums);
    const premiumAdjustedCostBasis = position.shares > 0 
      ? premiumAdjustedTotalCost / position.shares 
      : 0;

    return {
      ...position,
      premiumAdjustedCostBasis,
      premiumAdjustedTotalCost,
      appliedPremiums
    };
  });
};

/**
 * Calculate adjusted unrealized P&L using premium-adjusted cost basis
 */
export const calculateAdjustedUnrealizedPL = (
  position: StockPosition,
  usePremiumAdjusted: boolean
): { unrealizedPL: number; unrealizedPLPercent: number } | undefined => {
  if (!position.currentPrice || !position.marketValue) {
    return undefined;
  }

  const costBasis = usePremiumAdjusted && position.premiumAdjustedTotalCost !== undefined
    ? position.premiumAdjustedTotalCost
    : position.totalCostBasis;

  const unrealizedPL = position.marketValue - costBasis;
  const unrealizedPLPercent = costBasis > 0 ? (unrealizedPL / costBasis) * 100 : 0;

  return { unrealizedPL, unrealizedPLPercent };
};

/**
 * Get premiums that should NOT be counted as separate profit
 * (to avoid double-counting when premium-adjusted cost basis is enabled)
 */
export const getPremiumsAppliedToCostBasis = (
  optionTransactions: OptionTransaction[],
  accountId?: string
): number => {
  const filteredTransactions = accountId
    ? optionTransactions.filter(t => t.accountId === accountId)
    : optionTransactions;

  return filteredTransactions
    .filter(t => 
      t.action === 'sell-to-open' &&
      (t.strategy === 'covered-call' || t.strategy === 'cash-secured-put')
    )
    .reduce((sum, t) => sum + t.totalPremium, 0);
};

/**
 * Get the effective cost basis to use for display and calculations
 */
export const getEffectiveCostBasis = (
  position: StockPosition,
  usePremiumAdjusted: boolean
): { perShare: number; total: number } => {
  if (usePremiumAdjusted && position.premiumAdjustedCostBasis !== undefined) {
    return {
      perShare: position.premiumAdjustedCostBasis,
      total: position.premiumAdjustedTotalCost || position.totalCostBasis
    };
  }

  return {
    perShare: position.averageCostBasis,
    total: position.totalCostBasis
  };
};

/**
 * Get a breakdown of which strategies contributed premiums
 */
export const getPremiumBreakdown = (
  optionTransactions: OptionTransaction[],
  ticker: string,
  accountId: string
): { strategy: OptionStrategy; premium: number }[] => {
  const breakdown = new Map<OptionStrategy, number>();

  optionTransactions
    .filter(t => 
      t.ticker === ticker &&
      t.accountId === accountId &&
      t.action === 'sell-to-open' &&
      (t.strategy === 'covered-call' || t.strategy === 'cash-secured-put')
    )
    .forEach(t => {
      const current = breakdown.get(t.strategy) || 0;
      breakdown.set(t.strategy, current + t.totalPremium);
    });

  return Array.from(breakdown.entries()).map(([strategy, premium]) => ({
    strategy,
    premium
  }));
};
