import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { Search, Edit2, Trash2 } from 'lucide-react';
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
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isOptionModalOpen, setIsOptionModalOpen] = useState(false);
  const [editingStockTransaction, setEditingStockTransaction] = useState<StockTransaction | undefined>();
  const [editingOptionTransaction, setEditingOptionTransaction] = useState<OptionTransaction | undefined>();
  
  // Combine and sort all transactions
  const allTransactions = [
    ...stockTransactions.map(t => ({ ...t, type: 'stock' as const })),
    ...optionTransactions.map(t => ({ ...t, type: 'option' as const, date: t.transactionDate }))
  ]
    .filter(t => {
      if (selectedAccountId && t.accountId !== selectedAccountId) return false;
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (searchQuery && !t.ticker.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

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
      <div>
        <h1 className="text-3xl font-bold text-white">Transaction History</h1>
        <p className="text-gray-400 mt-1">
          {selectedAccountId
            ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
            : 'Viewing: All Accounts'}
        </p>
      </div>
      
      {/* Search and Filter */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow p-4">
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Ticker</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Action/Strategy</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Quantity</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Amount</th>
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
                    <td className="py-3 px-4 text-sm text-white text-right">
                      {transaction.type === 'stock'
                        ? `${(transaction as any).shares} shares`
                        : `${(transaction as any).contracts} contracts`}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-white text-right">
                      {transaction.type === 'stock'
                        ? formatCurrency((transaction as any).totalAmount)
                        : formatCurrency((transaction as any).totalPremium)}
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
                          title="Edit transaction"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTransaction(transaction)}
                          className="text-red-400 hover:text-red-300"
                          title="Delete transaction"
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
          <div className="text-center py-12">
            <p className="text-gray-400 text-lg">No transactions found</p>
            <p className="text-gray-500 text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}
      </div>
      
      {/* Summary */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-white mb-4">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-400">Total Transactions</p>
            <p className="text-2xl font-bold text-white">{allTransactions.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Stock Transactions</p>
            <p className="text-2xl font-bold text-blue-400">
              {allTransactions.filter(t => t.type === 'stock').length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-400">Option Transactions</p>
            <p className="text-2xl font-bold text-purple-400">
              {allTransactions.filter(t => t.type === 'option').length}
            </p>
          </div>
        </div>
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
