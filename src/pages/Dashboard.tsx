import React from 'react';
import { useAppContext } from '../context/AppContext';
import {
  calculatePortfolioSummary,
  calculateOptionsAnalytics,
  formatCurrency,
  formatPercentage,
  daysUntilExpiration
} from '../utils/calculations';
import { TrendingUp, TrendingDown, DollarSign, PieChart, Calendar } from 'lucide-react';

const Dashboard: React.FC = () => {
  const {
    accounts,
    stockPositions,
    optionPositions,
    stockTransactions,
    optionTransactions,
    selectedAccountId
  } = useAppContext();
  
  // Calculate portfolio summary
  const portfolioSummary = calculatePortfolioSummary(
    accounts,
    stockPositions,
    optionPositions,
    selectedAccountId || undefined
  );
  
  // Calculate options analytics
  const optionsAnalytics = calculateOptionsAnalytics(
    optionTransactions,
    optionPositions,
    selectedAccountId || undefined
  );
  
  // Get upcoming expirations (next 30 days)
  const upcomingExpirations = optionPositions
    .filter(p => p.status === 'open')
    .map(p => ({
      ...p,
      daysUntil: daysUntilExpiration(p.expirationDate)
    }))
    .filter(p => p.daysUntil >= 0 && p.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);
  
  // Get recent transactions (last 10)
  const allTransactions = [
    ...stockTransactions.map(t => ({ ...t, type: 'stock' as const })),
    ...optionTransactions.map(t => ({ ...t, type: 'option' as const, date: t.transactionDate }))
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);
  
  // Top 5 stock positions by value
  const topStockPositions = [...stockPositions]
    .sort((a, b) => (b.marketValue || b.totalCostBasis) - (a.marketValue || a.totalCostBasis))
    .slice(0, 5);
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">
          {selectedAccountId
            ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
            : 'Viewing: All Accounts'}
        </p>
      </div>
      
      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Portfolio Value</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(portfolioSummary.totalValue)}
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-full">
              <PieChart className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Cash</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(portfolioSummary.totalCash)}
              </p>
            </div>
            <div className="bg-green-100 p-3 rounded-full">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total P&L</p>
              <p className={`text-2xl font-bold mt-1 ${
                portfolioSummary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(portfolioSummary.totalPL)}
              </p>
              <p className={`text-sm ${
                portfolioSummary.totalPL >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatPercentage(portfolioSummary.totalPLPercent)}
              </p>
            </div>
            <div className={`p-3 rounded-full ${
              portfolioSummary.totalPL >= 0 ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {portfolioSummary.totalPL >= 0 ? (
                <TrendingUp className="w-6 h-6 text-green-600" />
              ) : (
                <TrendingDown className="w-6 h-6 text-red-600" />
              )}
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Options Premium (Net)</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(optionsAnalytics.netPremium)}
              </p>
              <p className="text-sm text-gray-600">
                Win Rate: {optionsAnalytics.winRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-full">
              <Calendar className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Stock Positions */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Stock Positions</h2>
          {topStockPositions.length > 0 ? (
            <div className="space-y-3">
              {topStockPositions.map(position => {
                const value = position.marketValue || position.totalCostBasis;
                const pl = position.unrealizedPL || 0;
                const plPercent = position.unrealizedPLPercent || 0;
                
                return (
                  <div key={`${position.ticker}-${position.accountId}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="font-semibold text-gray-900">{position.ticker}</p>
                      <p className="text-sm text-gray-600">{position.shares} shares</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-gray-900">{formatCurrency(value)}</p>
                      <p className={`text-sm ${pl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Upcoming Expirations
          </h2>
          {upcomingExpirations.length > 0 ? (
            <div className="space-y-3">
              {upcomingExpirations.map(position => {
                const isExpiringSoon = position.daysUntil <= 7;
                
                return (
                  <div key={position.id} className={`p-3 rounded-lg ${
                    isExpiringSoon ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {position.ticker} ${position.strikePrice} {position.optionType.toUpperCase()}
                        </p>
                        <p className="text-sm text-gray-600">{position.strategy}</p>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold ${
                          isExpiringSoon ? 'text-yellow-600' : 'text-gray-900'
                        }`}>
                          {position.daysUntil === 0 ? 'Today' : `${position.daysUntil}d`}
                        </p>
                        <p className="text-sm text-gray-600">
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
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Transactions</h2>
        {allTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Ticker</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Amount</th>
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((transaction, index) => (
                  <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm text-gray-900">
                      {new Date(transaction.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${
                        transaction.type === 'stock'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-purple-100 text-purple-700'
                      }`}>
                        {transaction.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {transaction.ticker}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {transaction.type === 'stock'
                        ? (transaction as any).action
                        : (transaction as any).strategy}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 text-right">
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
          <p className="text-gray-500 text-center py-8">No transactions yet</p>
        )}
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600 mb-2">Stock Positions</p>
          <p className="text-3xl font-bold text-gray-900">{stockPositions.length}</p>
          <p className="text-sm text-gray-600 mt-1">
            Value: {formatCurrency(portfolioSummary.stockValue)}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600 mb-2">Active Options</p>
          <p className="text-3xl font-bold text-gray-900">
            {optionPositions.filter(p => p.status === 'open').length}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Premium: {formatCurrency(optionsAnalytics.projectedPremium)}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600 mb-2">Accounts</p>
          <p className="text-3xl font-bold text-gray-900">
            {selectedAccountId ? 1 : accounts.length}
          </p>
          <p className="text-sm text-gray-600 mt-1">
            Total Cash: {formatCurrency(portfolioSummary.totalCash)}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
