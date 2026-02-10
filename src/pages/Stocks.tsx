import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { StockTransactionForm } from '../components/forms/StockTransactionForm';
import { formatCurrency, formatPercentage } from '../utils/calculations';
import { Plus, ChevronDown, ChevronUp, Search } from 'lucide-react';
import type { StockTransaction } from '../types';

const Stocks: React.FC = () => {
  const {
    stockPositions,
    addStockTransaction,
    selectedAccountId,
    accounts
  } = useAppContext();
  
  const [showForm, setShowForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<'ticker' | 'shares' | 'value' | 'pl'>('value');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  
  // Filter positions by search query
  const filteredPositions = stockPositions.filter(position =>
    position.ticker.toLowerCase().includes(searchQuery.toLowerCase())
  );
  
  // Sort positions
  const sortedPositions = [...filteredPositions].sort((a, b) => {
    let aValue, bValue;
    
    switch (sortField) {
      case 'ticker':
        aValue = a.ticker;
        bValue = b.ticker;
        break;
      case 'shares':
        aValue = a.shares;
        bValue = b.shares;
        break;
      case 'value':
        aValue = a.marketValue || a.totalCostBasis;
        bValue = b.marketValue || b.totalCostBasis;
        break;
      case 'pl':
        aValue = a.unrealizedPL || 0;
        bValue = b.unrealizedPL || 0;
        break;
      default:
        aValue = 0;
        bValue = 0;
    }
    
    if (sortDirection === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });
  
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };
  
  const handleSaveTransaction = (transaction: Omit<StockTransaction, 'id'>) => {
    addStockTransaction(transaction);
    setShowForm(false);
  };
  
  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };
  
  // Calculate totals
  const totalValue = sortedPositions.reduce((sum, p) => sum + (p.marketValue || p.totalCostBasis), 0);
  const totalCost = sortedPositions.reduce((sum, p) => sum + p.totalCostBasis, 0);
  const totalPL = sortedPositions.reduce((sum, p) => sum + (p.unrealizedPL || 0), 0);
  const totalPLPercent = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Stock Positions</h1>
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
          Add Transaction
        </button>
      </div>
      
      {/* Add Transaction Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Add Stock Transaction</h2>
          <StockTransactionForm
            onSave={handleSaveTransaction}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600">Total Positions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{sortedPositions.length}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600">Total Value</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalValue)}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600">Total Cost Basis</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(totalCost)}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-md p-6">
          <p className="text-sm text-gray-600">Total P&L</p>
          <p className={`text-2xl font-bold mt-1 ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(totalPL)}
          </p>
          <p className={`text-sm ${totalPL >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatPercentage(totalPLPercent)}
          </p>
        </div>
      </div>
      
      {/* Search and Filter */}
      <div className="bg-white rounded-lg shadow-md p-4">
        <div className="flex items-center gap-4">
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
        </div>
      </div>
      
      {/* Positions Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {sortedPositions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th
                    onClick={() => handleSort('ticker')}
                    className="text-left py-3 px-4 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    Ticker <SortIcon field="ticker" />
                  </th>
                  <th
                    onClick={() => handleSort('shares')}
                    className="text-right py-3 px-4 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    Shares <SortIcon field="shares" />
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                    Avg Cost
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                    Total Cost
                  </th>
                  <th
                    onClick={() => handleSort('value')}
                    className="text-right py-3 px-4 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    Market Value <SortIcon field="value" />
                  </th>
                  <th
                    onClick={() => handleSort('pl')}
                    className="text-right py-3 px-4 text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  >
                    P&L <SortIcon field="pl" />
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">
                    P&L %
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPositions.map((position, index) => {
                  const value = position.marketValue || position.totalCostBasis;
                  const pl = position.unrealizedPL || 0;
                  const plPercent = position.unrealizedPLPercent || 0;
                  
                  return (
                    <tr
                      key={`${position.ticker}-${position.accountId}-${index}`}
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-semibold text-gray-900">{position.ticker}</p>
                          {!selectedAccountId && (
                            <p className="text-xs text-gray-500">
                              {accounts.find(a => a.id === position.accountId)?.name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900">
                        {position.shares}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900">
                        {formatCurrency(position.averageCostBasis)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm text-gray-900">
                        {formatCurrency(position.totalCostBasis)}
                      </td>
                      <td className="py-3 px-4 text-right text-sm font-medium text-gray-900">
                        {formatCurrency(value)}
                      </td>
                      <td className={`py-3 px-4 text-right text-sm font-medium ${
                        pl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(pl)}
                      </td>
                      <td className={`py-3 px-4 text-right text-sm font-medium ${
                        pl >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatPercentage(plPercent)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No stock positions yet</p>
            <p className="text-gray-400 text-sm mt-2">Add your first stock transaction to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Stocks;
