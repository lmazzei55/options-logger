import React, { useState, useMemo } from 'react';
import { formatDateLocal } from '../utils/dateUtils';
import { useAppContext } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { Search, Edit2, Trash2, ArrowUpDown, Plus } from 'lucide-react';
import StockTransactionModal from '../components/modals/StockTransactionModal';
import OptionTransactionModal from '../components/modals/OptionTransactionModal';
import type { StockTransaction, OptionTransaction } from '../types';

const Transactions: React.FC = () => {
  const { 
    stockTransactions, 
    optionTransactions, 
    accounts, 
    selectedAccountId,
    deleteStockTransaction,
    deleteOptionTransaction
  } = useAppContext();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'stock' | 'option'>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'date' | 'ticker' | 'amount'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
  const [editingStockTransaction, setEditingStockTransaction] = useState<StockTransaction | undefined>();
  const [editingOptionTransaction, setEditingOptionTransaction] = useState<OptionTransaction | undefined>();
  
  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection(field === 'date' ? 'desc' : 'asc');
    }
  };

  // Combine, filter, and sort all transactions
  const allTransactions = useMemo(() => {
    const combined = [
      ...stockTransactions.map(t => ({
        ...t,
        type: 'stock' as const,
        date: t.date,
        amount: t.action === 'buy' ? -(t.shares * t.pricePerShare + (t.fees || 0)) : (t.shares * t.pricePerShare - (t.fees || 0))
      })),
      ...optionTransactions.map(t => ({
        ...t,
        type: 'option' as const,
        date: t.transactionDate,
        amount: t.action.includes('sell') ? (t.contracts * 100 * t.premiumPerShare - (t.fees || 0)) : -(t.contracts * 100 * t.premiumPerShare + (t.fees || 0))
      }))
    ];

    // Apply filters
    const filtered = combined.filter(t => {
      if (selectedAccountId && t.accountId !== selectedAccountId) return false;
      if (accountFilter !== 'all' && t.accountId !== accountFilter) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (searchQuery && !t.ticker.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });

    // Apply sorting
    return filtered.sort((a, b) => {
      let aVal, bVal;
      
      switch (sortField) {
        case 'date':
          aVal = new Date(a.date).getTime();
          bVal = new Date(b.date).getTime();
          break;
        case 'ticker':
          aVal = a.ticker;
          bVal = b.ticker;
          break;
        case 'amount':
          aVal = Math.abs(a.amount);
          bVal = Math.abs(b.amount);
          break;
      }

      const multiplier = sortDirection === 'asc' ? 1 : -1;
      
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * multiplier;
      }
      return ((aVal as number) - (bVal as number)) * multiplier;
    });
  }, [stockTransactions, optionTransactions, selectedAccountId, accountFilter, typeFilter, searchQuery, sortField, sortDirection]);

  const handleEditTransaction = (transaction: typeof allTransactions[0]) => {
    if (transaction.type === 'stock') {
      setEditingStockTransaction(transaction as StockTransaction);
      setIsStockModalOpen(true);
    } else {
      setEditingOptionTransaction(transaction as OptionTransaction);
      setIsOptionModalOpen(true);
    }
  };

  const handleDeleteTransaction = (transaction: typeof allTransactions[0]) => {
    const confirmMessage = `Are you sure you want to delete this ${transaction.type} transaction for ${transaction.ticker}? This cannot be undone.`;
    
    if (confirm(confirmMessage)) {
      if (transaction.type === 'stock') {
        deleteStockTransaction(transaction.id);
      } else {
        deleteOptionTransaction(transaction.id);
      }
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Transaction History</h1>
          <p className="text-gray-400 mt-1">
            {selectedAccountId
              ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
              : 'Viewing: All Accounts'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsStockModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Stock
          </button>
          <button
            onClick={() => setIsOptionModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Option
          </button>
        </div>
      </div>
      
      {/* Search and Filter */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by ticker..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!selectedAccountId && (
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="px-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Accounts</option>
                {accounts.map(account => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                typeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('stock')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                typeFilter === 'stock'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Stocks
            </button>
            <button
              onClick={() => setTypeFilter('option')}
              className={`px-4 py-2 rounded-md font-medium transition-colors ${
                typeFilter === 'option'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Options
            </button>
          </div>
        </div>
      </div>
      
      {/* Transactions Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow overflow-hidden">
        {allTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800 border-b border-gray-700">
                <tr>
                  <th
                    onClick={() => handleSort('date')}
                    className="text-left py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-1">
                      Date
                      {sortField === 'date' && <ArrowUpDown className="w-3 h-3" />}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Type</th>
                  <th
                    onClick={() => handleSort('ticker')}
                    className="text-left py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                  >
                    <div className="flex items-center gap-1">
                      Ticker
                      {sortField === 'ticker' && <ArrowUpDown className="w-3 h-3" />}
                    </div>
                  </th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Action/Strategy</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Quantity</th>
                  <th
                    onClick={() => handleSort('amount')}
                    className="text-right py-3 px-4 text-sm font-medium text-gray-300 cursor-pointer hover:bg-gray-700"
                  >
                    <div className="flex items-center justify-end gap-1">
                      Amount
                      {sortField === 'amount' && <ArrowUpDown className="w-3 h-3" />}
                    </div>
                  </th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Fees</th>
                  {!selectedAccountId && (
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Account</th>
                  )}
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allTransactions.map((transaction, index) => (
                  <tr key={index} className="border-b border-gray-800 hover:bg-gray-800">
                    <td className="py-3 px-4 text-sm text-white">
                      {formatDateLocal(transaction.date)}
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
                    <td className="py-3 px-4 text-sm text-right text-white">
                      {transaction.type === 'stock'
                        ? `${(transaction as any).shares} shares`
                        : `${(transaction as any).contracts} contracts`}
                    </td>
                    <td className={`py-3 px-4 text-sm text-right font-medium ${
                      transaction.amount >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-gray-400">
                      {formatCurrency((transaction as any).fees || 0)}
                    </td>
                    {!selectedAccountId && (
                      <td className="py-3 px-4 text-sm text-gray-400">
                        {accounts.find(a => a.id === transaction.accountId)?.name}
                      </td>
                    )}
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleEditTransaction(transaction)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Edit"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(transaction)}
                          className="text-red-400 hover:text-red-300"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-lg">No transactions found</p>
            <p className="text-gray-500 text-sm mt-2">
              {searchQuery || typeFilter !== 'all' || accountFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Add your first transaction to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Modals */}
      <StockTransactionModal
        isOpen={isStockModalOpen}
        onClose={() => {
          setIsStockModalOpen(false);
          setEditingStockTransaction(undefined);
        }}
        transaction={editingStockTransaction}
      />
      <OptionTransactionModal
        isOpen={isOptionModalOpen}
        onClose={() => {
          setIsOptionModalOpen(false);
          setEditingOptionTransaction(undefined);
        }}
        transaction={editingOptionTransaction}
      />
    </div>
  );
};

export default Transactions;
