import { describe, it, expect } from 'vitest';
import {
  calculateApplicablePremiums,
  applyPremiumAdjustments,
  calculateAdjustedUnrealizedPL,
  getPremiumsAppliedToCostBasis,
  getEffectiveCostBasis,
  getPremiumBreakdown
} from '../premiumAdjustedCalculations';
import type { StockPosition, OptionTransaction } from '../../types';

describe('Premium-Adjusted Cost Basis Calculations', () => {
  const mockStockPosition: StockPosition = {
    ticker: 'AAPL',
    accountId: 'acc-1',
    shares: 100,
    averageCostBasis: 150,
    totalCostBasis: 15000,
    firstPurchaseDate: '2024-01-01',
    lastTransactionDate: '2024-01-01',
    transactionIds: ['txn-1']
  };

  const mockCoveredCall: OptionTransaction = {
    id: 'opt-1',
    accountId: 'acc-1',
    ticker: 'AAPL',
    strategy: 'covered-call',
    optionType: 'call',
    action: 'sell-to-open',
    contracts: 1,
    strikePrice: 160,
    premiumPerShare: 2.5,
    totalPremium: 250,
    fees: 0,
    expirationDate: '2024-02-01',
    transactionDate: '2024-01-15',
    status: 'open'
  };

  const mockCashSecuredPut: OptionTransaction = {
    id: 'opt-2',
    accountId: 'acc-1',
    ticker: 'AAPL',
    strategy: 'cash-secured-put',
    optionType: 'put',
    action: 'sell-to-open',
    contracts: 1,
    strikePrice: 145,
    premiumPerShare: 1.5,
    totalPremium: 150,
    fees: 0,
    expirationDate: '2024-02-01',
    transactionDate: '2024-01-20',
    status: 'open'
  };

  const mockLongCall: OptionTransaction = {
    id: 'opt-3',
    accountId: 'acc-1',
    ticker: 'AAPL',
    strategy: 'long-call',
    optionType: 'call',
    action: 'buy-to-open',
    contracts: 1,
    strikePrice: 155,
    premiumPerShare: 3.0,
    totalPremium: 300,
    fees: 0,
    expirationDate: '2024-02-01',
    transactionDate: '2024-01-10',
    status: 'open'
  };

  describe('calculateApplicablePremiums', () => {
    it('should calculate premiums from covered calls', () => {
      const premiums = calculateApplicablePremiums([mockCoveredCall], 'AAPL', 'acc-1');
      expect(premiums).toBe(250);
    });

    it('should calculate premiums from cash-secured puts', () => {
      const premiums = calculateApplicablePremiums([mockCashSecuredPut], 'AAPL', 'acc-1');
      expect(premiums).toBe(150);
    });

    it('should sum multiple applicable premiums', () => {
      const premiums = calculateApplicablePremiums(
        [mockCoveredCall, mockCashSecuredPut],
        'AAPL',
        'acc-1'
      );
      expect(premiums).toBe(400); // 250 + 150
    });

    it('should exclude buy-to-open transactions', () => {
      const premiums = calculateApplicablePremiums([mockLongCall], 'AAPL', 'acc-1');
      expect(premiums).toBe(0);
    });

    it('should exclude options for different tickers', () => {
      const differentTicker = { ...mockCoveredCall, ticker: 'TSLA' };
      const premiums = calculateApplicablePremiums([differentTicker], 'AAPL', 'acc-1');
      expect(premiums).toBe(0);
    });

    it('should exclude options for different accounts', () => {
      const differentAccount = { ...mockCoveredCall, accountId: 'acc-2' };
      const premiums = calculateApplicablePremiums([differentAccount], 'AAPL', 'acc-1');
      expect(premiums).toBe(0);
    });

    it('should only include sell-to-open actions', () => {
      const buyToClose = { ...mockCoveredCall, action: 'buy-to-close' as const };
      const premiums = calculateApplicablePremiums([buyToClose], 'AAPL', 'acc-1');
      expect(premiums).toBe(0);
    });
  });

  describe('applyPremiumAdjustments', () => {
    it('should reduce cost basis by covered call premium', () => {
      const adjusted = applyPremiumAdjustments([mockStockPosition], [mockCoveredCall]);
      
      expect(adjusted[0].premiumAdjustedTotalCost).toBe(14750); // 15000 - 250
      expect(adjusted[0].premiumAdjustedCostBasis).toBe(147.5); // 14750 / 100
      expect(adjusted[0].appliedPremiums).toBe(250);
    });

    it('should reduce cost basis by multiple premiums', () => {
      const adjusted = applyPremiumAdjustments(
        [mockStockPosition],
        [mockCoveredCall, mockCashSecuredPut]
      );
      
      expect(adjusted[0].premiumAdjustedTotalCost).toBe(14600); // 15000 - 250 - 150
      expect(adjusted[0].premiumAdjustedCostBasis).toBe(146); // 14600 / 100
      expect(adjusted[0].appliedPremiums).toBe(400);
    });

    it('should not reduce cost basis below zero', () => {
      const largePremium: OptionTransaction = {
        ...mockCoveredCall,
        totalPremium: 20000 // More than total cost basis
      };
      
      const adjusted = applyPremiumAdjustments([mockStockPosition], [largePremium]);
      
      expect(adjusted[0].premiumAdjustedTotalCost).toBe(0);
      expect(adjusted[0].premiumAdjustedCostBasis).toBe(0);
    });

    it('should handle positions with no applicable premiums', () => {
      const adjusted = applyPremiumAdjustments([mockStockPosition], []);
      
      expect(adjusted[0].premiumAdjustedTotalCost).toBe(15000);
      expect(adjusted[0].premiumAdjustedCostBasis).toBe(150);
      expect(adjusted[0].appliedPremiums).toBe(0);
    });

    it('should handle multiple positions independently', () => {
      const tslaPosition: StockPosition = {
        ...mockStockPosition,
        ticker: 'TSLA',
        totalCostBasis: 20000,
        averageCostBasis: 200
      };

      const tslaCoveredCall: OptionTransaction = {
        ...mockCoveredCall,
        ticker: 'TSLA',
        totalPremium: 300
      };

      const adjusted = applyPremiumAdjustments(
        [mockStockPosition, tslaPosition],
        [mockCoveredCall, tslaCoveredCall]
      );
      
      // AAPL position
      expect(adjusted[0].premiumAdjustedTotalCost).toBe(14750); // 15000 - 250
      expect(adjusted[0].appliedPremiums).toBe(250);
      
      // TSLA position
      expect(adjusted[1].premiumAdjustedTotalCost).toBe(19700); // 20000 - 300
      expect(adjusted[1].appliedPremiums).toBe(300);
    });

    it('should preserve original cost basis values', () => {
      const adjusted = applyPremiumAdjustments([mockStockPosition], [mockCoveredCall]);
      
      expect(adjusted[0].averageCostBasis).toBe(150); // Original unchanged
      expect(adjusted[0].totalCostBasis).toBe(15000); // Original unchanged
    });
  });

  describe('calculateAdjustedUnrealizedPL', () => {
    const positionWithMarketValue: StockPosition = {
      ...mockStockPosition,
      currentPrice: 160,
      marketValue: 16000,
      premiumAdjustedTotalCost: 14750,
      premiumAdjustedCostBasis: 147.5,
      appliedPremiums: 250
    };

    it('should calculate P&L using original cost basis when disabled', () => {
      const pl = calculateAdjustedUnrealizedPL(positionWithMarketValue, false);
      
      expect(pl).toBeDefined();
      expect(pl!.unrealizedPL).toBe(1000); // 16000 - 15000
      expect(pl!.unrealizedPLPercent).toBeCloseTo(6.67, 1); // (1000 / 15000) * 100
    });

    it('should calculate P&L using adjusted cost basis when enabled', () => {
      const pl = calculateAdjustedUnrealizedPL(positionWithMarketValue, true);
      
      expect(pl).toBeDefined();
      expect(pl!.unrealizedPL).toBe(1250); // 16000 - 14750
      expect(pl!.unrealizedPLPercent).toBeCloseTo(8.47, 1); // (1250 / 14750) * 100
    });

    it('should return undefined if no market value', () => {
      const pl = calculateAdjustedUnrealizedPL(mockStockPosition, true);
      expect(pl).toBeUndefined();
    });

    it('should handle negative P&L', () => {
      const losingPosition: StockPosition = {
        ...positionWithMarketValue,
        currentPrice: 140,
        marketValue: 14000
      };
      
      const pl = calculateAdjustedUnrealizedPL(losingPosition, true);
      
      expect(pl).toBeDefined();
      expect(pl!.unrealizedPL).toBe(-750); // 14000 - 14750
      expect(pl!.unrealizedPLPercent).toBeCloseTo(-5.08, 1);
    });
  });

  describe('getPremiumsAppliedToCostBasis', () => {
    it('should sum all applicable premiums', () => {
      const total = getPremiumsAppliedToCostBasis([mockCoveredCall, mockCashSecuredPut]);
      expect(total).toBe(400); // 250 + 150
    });

    it('should filter by account ID', () => {
      const acc2Option = { ...mockCoveredCall, accountId: 'acc-2' };
      const total = getPremiumsAppliedToCostBasis(
        [mockCoveredCall, acc2Option],
        'acc-1'
      );
      expect(total).toBe(250); // Only acc-1 option
    });

    it('should exclude non-applicable strategies', () => {
      const total = getPremiumsAppliedToCostBasis([mockLongCall]);
      expect(total).toBe(0);
    });

    it('should handle empty transaction list', () => {
      const total = getPremiumsAppliedToCostBasis([]);
      expect(total).toBe(0);
    });
  });

  describe('getEffectiveCostBasis', () => {
    const adjustedPosition: StockPosition = {
      ...mockStockPosition,
      premiumAdjustedCostBasis: 147.5,
      premiumAdjustedTotalCost: 14750,
      appliedPremiums: 250
    };

    it('should return adjusted values when enabled', () => {
      const basis = getEffectiveCostBasis(adjustedPosition, true);
      
      expect(basis.perShare).toBe(147.5);
      expect(basis.total).toBe(14750);
    });

    it('should return original values when disabled', () => {
      const basis = getEffectiveCostBasis(adjustedPosition, false);
      
      expect(basis.perShare).toBe(150);
      expect(basis.total).toBe(15000);
    });

    it('should return original values if no adjusted values exist', () => {
      const basis = getEffectiveCostBasis(mockStockPosition, true);
      
      expect(basis.perShare).toBe(150);
      expect(basis.total).toBe(15000);
    });
  });

  describe('getPremiumBreakdown', () => {
    it('should break down premiums by strategy', () => {
      const breakdown = getPremiumBreakdown(
        [mockCoveredCall, mockCashSecuredPut],
        'AAPL',
        'acc-1'
      );
      
      expect(breakdown).toHaveLength(2);
      expect(breakdown).toContainEqual({ strategy: 'covered-call', premium: 250 });
      expect(breakdown).toContainEqual({ strategy: 'cash-secured-put', premium: 150 });
    });

    it('should sum premiums for same strategy', () => {
      const secondCoveredCall = { ...mockCoveredCall, id: 'opt-4', totalPremium: 200 };
      const breakdown = getPremiumBreakdown(
        [mockCoveredCall, secondCoveredCall],
        'AAPL',
        'acc-1'
      );
      
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0]).toEqual({ strategy: 'covered-call', premium: 450 }); // 250 + 200
    });

    it('should filter by ticker and account', () => {
      const tslaOption = { ...mockCoveredCall, ticker: 'TSLA' };
      const breakdown = getPremiumBreakdown(
        [mockCoveredCall, tslaOption],
        'AAPL',
        'acc-1'
      );
      
      expect(breakdown).toHaveLength(1);
      expect(breakdown[0].premium).toBe(250); // Only AAPL option
    });

    it('should return empty array if no applicable premiums', () => {
      const breakdown = getPremiumBreakdown([mockLongCall], 'AAPL', 'acc-1');
      expect(breakdown).toHaveLength(0);
    });
  });

  describe('Integration Tests', () => {
    it('should maintain total P&L consistency', () => {
      // Scenario: Buy 100 shares at $150, sell covered call for $250 premium
      // Stock rises to $160, option expires worthless
      
      const position: StockPosition = {
        ...mockStockPosition,
        currentPrice: 160,
        marketValue: 16000
      };

      // Without premium adjustment
      const originalPL = 16000 - 15000; // $1000 stock gain
      const optionPremium = 250;
      const totalPLWithoutAdjustment = originalPL + optionPremium; // $1250

      // With premium adjustment
      const adjusted = applyPremiumAdjustments([position], [mockCoveredCall])[0];
      const adjustedPL = calculateAdjustedUnrealizedPL(adjusted, true);
      const totalPLWithAdjustment = adjustedPL!.unrealizedPL; // $1250 (16000 - 14750)

      // Total P&L should be the same
      expect(totalPLWithAdjustment).toBe(totalPLWithoutAdjustment);
    });

    it('should handle complex multi-position scenario', () => {
      const positions: StockPosition[] = [
        { ...mockStockPosition, ticker: 'AAPL', totalCostBasis: 15000, shares: 100 },
        { ...mockStockPosition, ticker: 'TSLA', totalCostBasis: 20000, shares: 100 },
        { ...mockStockPosition, ticker: 'MSFT', totalCostBasis: 30000, shares: 100 }
      ];

      const options: OptionTransaction[] = [
        { ...mockCoveredCall, ticker: 'AAPL', totalPremium: 250 },
        { ...mockCoveredCall, ticker: 'AAPL', id: 'opt-5', totalPremium: 200 },
        { ...mockCashSecuredPut, ticker: 'TSLA', totalPremium: 300 }
        // No options for MSFT
      ];

      const adjusted = applyPremiumAdjustments(positions, options);

      // AAPL: 15000 - 450 = 14550
      expect(adjusted[0].premiumAdjustedTotalCost).toBe(14550);
      expect(adjusted[0].appliedPremiums).toBe(450);

      // TSLA: 20000 - 300 = 19700
      expect(adjusted[1].premiumAdjustedTotalCost).toBe(19700);
      expect(adjusted[1].appliedPremiums).toBe(300);

      // MSFT: unchanged
      expect(adjusted[2].premiumAdjustedTotalCost).toBe(30000);
      expect(adjusted[2].appliedPremiums).toBe(0);
    });
  });
});
