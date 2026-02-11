import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  calculatePortfolioSummary,
  calculateOptionsAnalytics,
  formatCurrency,
  formatPercentage,
  daysUntilExpiration
} from '../utils/calculations';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Calendar, Plus, Shield, Wallet } from 'lucide-react';
import StockTransactionModal from '../components/modals/StockTransactionModal';
import OptionTransactionModal from '../components/modals/OptionTransactionModal';
import PortfolioCharts from '../components/charts/PortfolioCharts';

const Dashboard: React.FC = () => {
  const {
    accounts,
    stockPositions,
    optionPositions,
    stockTransactions,
    optionTransactions,
    selectedAccountId
  } = useAppContext();

  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);

  const portfolioSummary = calculatePortfolioSummary(
    accounts, stockPositions, optionPositions, selectedAccountId || undefined
  );

  const optionsAnalytics = calculateOptionsAnalytics(
    optionTransactions, optionPositions, selectedAccountId || undefined
  );

  const upcomingExpirations = optionPositions
    .filter(p => p.status === 'open')
    .map(p => ({ ...p, daysUntil: daysUntilExpiration(p.expirationDate) }))
    .filter(p => p.daysUntil >= 0 && p.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  const allTransactions = [
    ...stockTransactions.map(t => ({ ...t, type: 'stock' as const })),
    ...optionTransactions.map(t => ({ ...t, type: 'option' as const, date: t.transactionDate }))
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  // Aggregate stock positions by ticker when viewing all accounts
  const aggregatedPositions = selectedAccountId
    ? stockPositions // Don't aggregate for single account view
    : stockPositions.reduce((acc, pos) => {
        const existing = acc.find(p => p.ticker === pos.ticker);
        if (existing) {
          // Aggregate: sum shares and cost basis, recalculate average
          const totalShares = existing.shares + pos.shares;
          const totalCost = existing.totalCostBasis + pos.totalCostBasis;
          const totalMarketValue = (existing.marketValue || existing.totalCostBasis) + (pos.marketValue || pos.totalCostBasis);
          existing.shares = totalShares;
          existing.totalCostBasis = totalCost;
          existing.averageCostBasis = totalCost / totalShares;
          existing.marketValue = totalMarketValue;
          existing.transactionIds = [...existing.transactionIds, ...pos.transactionIds];
        } else {
          acc.push({ ...pos });
        }
        return acc;
      }, [] as typeof stockPositions);
  
  const topStockPositions = [...aggregatedPositions]
    .sort((a, b) => (b.marketValue || b.totalCostBasis) - (a.marketValue || a.totalCostBasis))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            {selectedAccountId
              ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
              : 'Viewing: All Accounts'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsStockModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Stock
          </button>
          <button
            onClick={() => setIsOptionModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Option
          </button>
        </div>
      </div>

      {/* Portfolio Summary Cards - Row 1 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Portfolio Value</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(portfolioSummary.totalValue)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Cash + Stocks
              </p>
            </div>
            <div className="bg-blue-900/50 p-3 rounded-full">
              <PieChart className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total Cash</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(portfolioSummary.totalCash)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Available: {formatCurrency(portfolioSummary.availableCash)}
              </p>
            </div>
            <div className="bg-green-900/50 p-3 rounded-full">
              <DollarSign className="w-6 h-6 text-green-400" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Total P&L</p>
              <p className={`text-2xl font-bold mt-1 ${
                portfolioSummary.totalPL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatCurrency(portfolioSummary.totalPL)}
              </p>
              <p className={`text-sm ${
                portfolioSummary.totalPL >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {formatPercentage(portfolioSummary.totalPLPercent)}
              </p>
            </div>
            <div className={`p-3 rounded-full ${
              portfolioSummary.totalPL >= 0 ? 'bg-green-900/50' : 'bg-red-900/50'
            }`}>
              {portfolioSummary.totalPL >= 0 ? (
                <TrendingUp className="w-6 h-6 text-green-400" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-400" />
              )}
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Options Premium (Net)</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(optionsAnalytics.netPremium)}
              </p>
              <p className="text-sm text-gray-400">
                Win Rate: {optionsAnalytics.winRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-purple-900/50 p-3 rounded-full">
              <Calendar className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Breakdown - Row 2 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Stock Holdings</p>
              <p className="text-xl font-bold text-white">
                {formatCurrency(portfolioSummary.stockValue)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {stockPositions.length} position{stockPositions.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="bg-blue-900/50 p-3 rounded-full">
              <TrendingUp className="w-5 h-5 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Active Collateral</p>
              <p className="text-xl font-bold text-yellow-400">
                {formatCurrency(portfolioSummary.activeCollateral)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Reserved for open options
              </p>
            </div>
            <div className="bg-yellow-900/50 p-3 rounded-full">
              <Shield className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400 mb-1">Available to Trade</p>
              <p className="text-xl font-bold text-green-400">
                {formatCurrency(portfolioSummary.availableCash)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Cash minus collateral
              </p>
            </div>
            <div className="bg-green-900/50 p-3 rounded-full">
              <Wallet className="w-5 h-5 text-green-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Portfolio Composition Charts */}
      <PortfolioCharts portfolioSummary={portfolioSummary} stockPositions={aggregatedPositions} />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Stock Positions */}
        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-4">Top Stock Positions</h2>
          {topStockPositions.length > 0 ? (
            <div className="space-y-3">
              {topStockPositions.map(position => {
                const value = position.marketValue || position.totalCostBasis;
                const pl = position.unrealizedPL || 0;
                const plPercent = position.unrealizedPLPercent || 0;

                return (
                  <div key={`${position.ticker}-${position.accountId}`} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                    <div>
                      <p className="font-semibold text-white">{position.ticker}</p>
                      <p className="text-sm text-gray-400">{position.shares} shares @ {formatCurrency(position.averageCostBasis)}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-white">{formatCurrency(value)}</p>
                      <p className={`text-sm ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatCurrency(pl)} ({formatPercentage(plPercent)})
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No stock positions yet</p>
          )}
        </div>

        {/* Upcoming Options Expirations */}
        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Upcoming Expirations
          </h2>
          {upcomingExpirations.length > 0 ? (
            <div className="space-y-3">
              {upcomingExpirations.map(position => {
                const isExpiringSoon = position.daysUntil <= 7;

                return (
                  <div key={position.id} className={`p-3 rounded-lg ${
                    isExpiringSoon ? 'bg-yellow-900/30 border border-yellow-700' : 'bg-gray-800'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">
                          {position.ticker} ${position.strikePrice} {position.optionType.toUpperCase()}
                        </p>
                        <p className="text-sm text-gray-400">{position.strategy}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${
                          isExpiringSoon ? 'text-yellow-400' : 'text-white'
                        }`}>
                          {position.daysUntil === 0 ? 'Today' : `${position.daysUntil}d`}
                        </p>
                        <p className="text-sm text-gray-400">
                          {position.contracts} contract{position.contracts > 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No upcoming expirations</p>
          )}
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
        <h2 className="text-lg font-semibold text-white mb-4">Recent Transactions</h2>
        {allTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Ticker</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Action</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-400">Amount</th>
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((transaction, index) => (
                  <tr key={index} className="border-b border-gray-800 hover:bg-gray-800">
                    <td className="py-3 px-4 text-sm text-white">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                        transaction.type === 'stock'
                          ? 'bg-blue-900/30 text-blue-400'
                          : 'bg-purple-900/30 text-purple-400'
                      }`}>
                        {transaction.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-white">
                      {transaction.ticker}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">
                      {transaction.type === 'stock'
                        ? (transaction as any).action
                        : (transaction as any).strategy}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-white text-right">
                      {transaction.type === 'stock'
                        ? formatCurrency((transaction as any).totalAmount)
                        : formatCurrency((transaction as any).totalPremium)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">No transactions yet. Add your first transaction to get started!</p>
        )}
      </div>

      {/* Modals */}
      <StockTransactionModal
        isOpen={isStockModalOpen}
        onClose={() => setIsStockModalOpen(false)}
      />
      <OptionTransactionModal
        isOpen={isOptionModalOpen}
        onClose={() => setIsOptionModalOpen(false)}
      />
    </div>
  );
};

export default Dashboard;
