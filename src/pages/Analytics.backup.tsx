import React from 'react';
import { useAppContext } from '../context/AppContext';
import {
  calculatePortfolioSummary,
  calculateOptionsAnalytics,
  calculateStockAnalytics,
  formatCurrency,
  formatPercentage
} from '../utils/calculations';
import { TrendingUp, PieChart, BarChart3, DollarSign } from 'lucide-react';

const Analytics: React.FC = () => {
  const {
    accounts,
    stockPositions,
    optionPositions,
    stockTransactions,
    optionTransactions,
    selectedAccountId
  } = useAppContext();
  
  const portfolioSummary = calculatePortfolioSummary(
    accounts,
    stockPositions,
    optionPositions,
    selectedAccountId || undefined
  );
  
  const optionsAnalytics = calculateOptionsAnalytics(
    optionTransactions,
    optionPositions,
    selectedAccountId || undefined
  );
  
  const stockAnalytics = calculateStockAnalytics(
    stockTransactions,
    stockPositions,
    selectedAccountId || undefined
  );
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics & Reports</h1>
        <p className="text-gray-600 mt-1">
          {selectedAccountId
            ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
            : 'Viewing: All Accounts'}
        </p>
      </div>
      
      {/* Portfolio Overview */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <PieChart className="w-5 h-5" />
          Portfolio Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div>
            <p className="text-sm text-gray-600">Total Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(portfolioSummary.totalValue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Invested</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(portfolioSummary.totalInvested)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total P&L</p>
            <p className={`text-2xl font-bold mt-1 ${
              portfolioSummary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(portfolioSummary.totalPL)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Return %</p>
            <p className={`text-2xl font-bold mt-1 ${
              portfolioSummary.totalPLPercent >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatPercentage(portfolioSummary.totalPLPercent)}
            </p>
          </div>
        </div>
      </div>
      
      {/* Asset Allocation */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5" />
          Asset Allocation
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Stocks</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(portfolioSummary.stockValue)}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {portfolioSummary.totalValue > 0
                ? ((portfolioSummary.stockValue / portfolioSummary.totalValue) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Options</p>
            <p className="text-2xl font-bold text-purple-600">
              {formatCurrency(portfolioSummary.optionValue)}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {portfolioSummary.totalValue > 0
                ? ((portfolioSummary.optionValue / portfolioSummary.totalValue) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Cash</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(portfolioSummary.totalCash)}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {portfolioSummary.totalValue > 0
                ? ((portfolioSummary.totalCash / portfolioSummary.totalValue) * 100).toFixed(1)
                : 0}%
            </p>
          </div>
        </div>
      </div>
      
      {/* Stock Analytics */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Stock Analytics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600">Total Positions</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {stockAnalytics.positionCount}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Stock Value</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(stockAnalytics.totalStockValue)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Cost Basis</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(stockAnalytics.totalCostBasis)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Unrealized P&L</p>
            <p className={`text-2xl font-bold mt-1 ${
              stockAnalytics.totalUnrealizedPL >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(stockAnalytics.totalUnrealizedPL)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Realized P&L</p>
            <p className={`text-2xl font-bold mt-1 ${
              stockAnalytics.totalRealizedPL >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(stockAnalytics.totalRealizedPL)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg Holding Period</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {stockAnalytics.averageHoldingPeriod.toFixed(0)} days
            </p>
          </div>
        </div>
      </div>
      
      {/* Options Analytics */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Options Analytics
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <p className="text-sm text-gray-600">Premium Collected</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {formatCurrency(optionsAnalytics.totalPremiumCollected)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Premium Paid</p>
            <p className="text-2xl font-bold text-red-600 mt-1">
              {formatCurrency(optionsAnalytics.totalPremiumPaid)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Net Premium</p>
            <p className={`text-2xl font-bold mt-1 ${
              optionsAnalytics.netPremium >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(optionsAnalytics.netPremium)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Win Rate</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {optionsAnalytics.winRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Annualized Return</p>
            <p className="text-2xl font-bold text-green-600 mt-1">
              {optionsAnalytics.annualizedReturn.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Assignment Rate</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {optionsAnalytics.assignmentRate.toFixed(1)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg Return Per Trade</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {formatCurrency(optionsAnalytics.averageReturnPerTrade)}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Avg Days to Close</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {optionsAnalytics.averageDaysToClose.toFixed(0)} days
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Collateral Efficiency</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {optionsAnalytics.collateralEfficiency.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
      
      {/* Collateral Tracking */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Collateral Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-orange-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Active Collateral</p>
            <p className="text-2xl font-bold text-orange-600">
              {formatCurrency(optionsAnalytics.activeCollateral)}
            </p>
            <p className="text-sm text-gray-600 mt-1">Currently reserved</p>
          </div>
          <div className="bg-blue-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Available Cash</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(portfolioSummary.totalCash - optionsAnalytics.activeCollateral)}
            </p>
            <p className="text-sm text-gray-600 mt-1">For new trades</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2">Projected Premium</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(optionsAnalytics.projectedPremium)}
            </p>
            <p className="text-sm text-gray-600 mt-1">From open positions</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
