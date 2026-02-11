import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import StockTransactionModal from '../components/modals/StockTransactionModal';
import type { StockTransaction } from '../types';

const Stocks: React.FC = () => {
  const {
    stockPositions,
    stockTransactions,
    selectedAccountId,
    accounts,
    deleteStockTransaction
  } = useAppContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<StockTransaction | undefined>();
  const [sortField, setSortField] = useState<'ticker' | 'shares' | 'totalCostBasis'>('ticker');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [searchTerm, setSearchTerm] = useState('');

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const filteredAndSortedPositions = useMemo(() => {
    let filtered = stockPositions;

    if (searchTerm) {
      filtered = filtered.filter(p =>
        p.ticker.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    return [...filtered].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const multiplier = sortDirection === 'asc' ? 1 : -1;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }
      return ((aVal as number) - (bVal as number)) * multiplier;
    });
  }, [stockPositions, searchTerm, sortField, sortDirection]);

  const handleAddTransaction = () => {
    setEditingTransaction(undefined);
    setIsModalOpen(true);
  };

  const handleEditPosition = (ticker: string, accountId: string) => {
    // Find the most recent transaction for this position
    const recentTransaction = stockTransactions
      .filter(t => t.ticker === ticker && t.accountId === accountId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    if (recentTransaction) {
      setEditingTransaction(recentTransaction);
      setIsModalOpen(true);
    }
  };

  const handleDeletePosition = (ticker: string, accountId: string) => {
    if (!confirm(`Are you sure you want to delete all transactions for ${ticker}? This cannot be undone.`)) {
      return;
    }

    const transactionsToDelete = stockTransactions.filter(
      t => t.ticker === ticker && t.accountId === accountId
    );

    transactionsToDelete.forEach(t => deleteStockTransaction(t.id));
  };

  const totalPortfolioValue = useMemo(() => {
    return stockPositions.reduce((sum, p) => sum + p.totalCostBasis, 0);
  }, [stockPositions]);

  const totalShares = useMemo(() => {
    return stockPositions.reduce((sum, p) => sum + p.shares, 0);
  }, [stockPositions]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Stock Positions</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {selectedAccountId 
              ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
              : 'Viewing: All Accounts'}
          </p>
        </div>
        <button
          onClick={handleAddTransaction}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Add Transaction
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Positions</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {stockPositions.length}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Shares</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            {totalShares.toLocaleString()}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-6">
          <div className="text-sm text-gray-600 dark:text-gray-400">Total Cost Basis</div>
          <div className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            ${totalPortfolioValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search by ticker..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Positions Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th
                  onClick={() => handleSort('ticker')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Ticker {sortField === 'ticker' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  onClick={() => handleSort('shares')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Shares {sortField === 'shares' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Avg Cost
                </th>
                <th
                  onClick={() => handleSort('totalCostBasis')}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Total Cost {sortField === 'totalCostBasis' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  First Purchase
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
              {filteredAndSortedPositions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {searchTerm ? 'No positions found matching your search.' : 'No stock positions found. Click "Add Transaction" to get started.'}
                  </td>
                </tr>
              ) : (
                filteredAndSortedPositions.map((position) => (
                  <tr key={`${position.accountId}-${position.ticker}`} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {position.ticker}
                      </div>
                      {!selectedAccountId && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {accounts.find(a => a.id === position.accountId)?.name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {position.shares.toLocaleString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 dark:text-white">
                        ${position.averageCostBasis.toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        ${position.totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        {new Date(position.firstPurchaseDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEditPosition(position.ticker, position.accountId)}
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                          title="Edit latest transaction"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeletePosition(position.ticker, position.accountId)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                          title="Delete all transactions"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Modal */}
      <StockTransactionModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTransaction(undefined);
        }}
        transaction={editingTransaction}
      />
    </div>
  );
};

export default Stocks;
