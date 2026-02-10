import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { OptionTransactionForm } from '../components/forms/OptionTransactionForm';
import {
  formatCurrency,
  daysUntilExpiration,
  calculateOptionsAnalytics,
  calculateAnnualizedReturn
} from '../utils/calculations';
import { Plus, Search, TrendingUp, DollarSign, Target, Calendar } from 'lucide-react';
import type { OptionTransaction } from '../types';

const Options: React.FC = () => {
  const {
    optionPositions,
    optionTransactions,
    addOptionTransaction,
    selectedAccountId,
    accounts
  } = useAppContext();
  
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  
  // Calculate analytics
  const analytics = calculateOptionsAnalytics(
    optionTransactions,
    optionPositions,
    selectedAccountId || undefined
  );
  
  // Filter positions
  const filteredPositions = optionPositions.filter(position => {
    const matchesSearch = position.ticker.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'open' && position.status === 'open') ||
      (statusFilter === 'closed' && (position.status === 'closed' || position.status === 'expired' || position.status === 'assigned'));
    
    return matchesSearch && matchesStatus;
  });
  
  // Group positions by status
  const openPositions = filteredPositions.filter(p => p.status === 'open');
  const expiringSoon = openPositions.filter(p => daysUntilExpiration(p.expirationDate) <= 7);
  const closedPositions = filteredPositions.filter(p => p.status !== 'open');
  
  const handleSaveTransaction = (transaction: Omit<OptionTransaction, 'id'>) => {
    addOptionTransaction(transaction);
    setShowForm(false);
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-100 text-blue-700';
      case 'expired':
        return 'bg-gray-100 text-gray-700';
      case 'assigned':
        return 'bg-purple-100 text-purple-700';
      case 'closed':
        return 'bg-green-100 text-green-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };
  
  const PositionCard = ({ position }: { position: typeof optionPositions[0] }) => {
    const daysUntil = daysUntilExpiration(position.expirationDate);
    const isExpiringSoon = daysUntil <= 7 && position.status === 'open';
    const annualizedReturn = position.collateralRequired
      ? calculateAnnualizedReturn(
          position.totalPremium,
          position.collateralRequired,
          Math.abs(daysUntil)
        )
      : 0;
    
    return (
      <div className={`bg-white rounded-lg shadow-md p-6 border-l-4 ${
        isExpiringSoon ? 'border-yellow-500' : 'border-blue-500'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {position.ticker} ${position.strikePrice} {position.optionType.toUpperCase()}
            </h3>
            <p className="text-sm text-gray-600">{position.strategy}</p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
            {position.status}
          </span>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-600">Contracts</p>
            <p className="text-sm font-semibold text-gray-900">{position.contracts}</p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Premium</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatCurrency(position.totalPremium)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Expiration</p>
            <p className="text-sm font-semibold text-gray-900">
              {new Date(position.expirationDate).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Days {position.status === 'open' ? 'Until' : 'Held'}</p>
            <p className={`text-sm font-semibold ${
              isExpiringSoon ? 'text-yellow-600' : 'text-gray-900'
            }`}>
              {Math.abs(daysUntil)}
            </p>
          </div>
        </div>
        
        {position.collateralRequired && (
          <div className="bg-gray-50 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Collateral</span>
              <span className="text-sm font-semibold text-gray-900">
                {formatCurrency(position.collateralRequired)}
              </span>
            </div>
            {annualizedReturn > 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">Annualized Return</span>
                <span className="text-xs font-semibold text-green-600">
                  {annualizedReturn.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}
        
        {position.realizedPL !== undefined && (
          <div className={`text-sm font-semibold ${
            position.realizedPL >= 0 ? 'text-green-600' : 'text-red-600'
          }`}>
            P&L: {formatCurrency(position.realizedPL)}
          </div>
        )}
        
        {!selectedAccountId && (
          <p className="text-xs text-gray-500 mt-2">
            {accounts.find(a => a.id === position.accountId)?.name}
          </p>
        )}
      </div>
    );
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Options Positions</h1>
          <p className="text-gray-600 mt-1">
            {selectedAccountId
              ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
              : 'Viewing: All Accounts'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Option
        </button>
      </div>
      
      {/* Add Option Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Option Transaction</h2>
          <OptionTransactionForm
            onSave={handleSaveTransaction}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
      
      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Premium</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(analytics.netPremium)}
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
              <p className="text-sm text-gray-600">Win Rate</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {analytics.winRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-blue-100 p-3 rounded-full">
              <Target className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Annualized Return</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {analytics.annualizedReturn.toFixed(2)}%
              </p>
            </div>
            <div className="bg-purple-100 p-3 rounded-full">
              <TrendingUp className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Collateral</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatCurrency(analytics.activeCollateral)}
              </p>
            </div>
            <div className="bg-orange-100 p-3 rounded-full">
              <Calendar className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Additional Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600 mb-2">Avg Return Per Trade</p>
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(analytics.averageReturnPerTrade)}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600 mb-2">Assignment Rate</p>
          <p className="text-xl font-bold text-gray-900">
            {analytics.assignmentRate.toFixed(1)}%
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600 mb-2">Avg Days to Close</p>
          <p className="text-xl font-bold text-gray-900">
            {analytics.averageDaysToClose.toFixed(0)} days
          </p>
        </div>
      </div>
      
      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by ticker..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('open')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'open'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Open
            </button>
            <button
              onClick={() => setStatusFilter('closed')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === 'closed'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Closed
            </button>
          </div>
        </div>
      </div>
      
      {/* Expiring Soon Alert */}
      {expiringSoon.length > 0 && (
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-lg">
          <div className="flex items-center">
            <Calendar className="w-5 h-5 text-yellow-600 mr-3" />
            <div>
              <p className="font-semibold text-yellow-800">
                {expiringSoon.length} position{expiringSoon.length > 1 ? 's' : ''} expiring within 7 days
              </p>
              <p className="text-sm text-yellow-700">Review these positions for potential actions</p>
            </div>
          </div>
        </div>
      )}
      
      {/* Open Positions */}
      {openPositions.length > 0 && (statusFilter === 'all' || statusFilter === 'open') && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Open Positions ({openPositions.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {openPositions.map(position => (
              <PositionCard key={position.id} position={position} />
            ))}
          </div>
        </div>
      )}
      
      {/* Closed Positions */}
      {closedPositions.length > 0 && (statusFilter === 'all' || statusFilter === 'closed') && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Closed Positions ({closedPositions.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {closedPositions.map(position => (
              <PositionCard key={position.id} position={position} />
            ))}
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {filteredPositions.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500 text-lg">No options positions yet</p>
          <p className="text-gray-400 text-sm mt-2">Add your first option transaction to get started</p>
        </div>
      )}
    </div>
  );
};

export default Options;
