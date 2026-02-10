import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { Search } from 'lucide-react';

const Transactions: React.FC = () => {
  const { stockTransactions, optionTransactions, accounts, selectedAccountId } = useAppContext();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'stock' | 'option'>('all');
  
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
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Transaction History</h1>
        <p className="text-gray-600 mt-1">
          {selectedAccountId
            ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
            : 'Viewing: All Accounts'}
        </p>
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
              onClick={() => setTypeFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                typeFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setTypeFilter('stock')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                typeFilter === 'stock'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Stocks
            </button>
            <button
              onClick={() => setTypeFilter('option')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                typeFilter === 'option'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Options
            </button>
          </div>
        </div>
      </div>
      
      {/* Transactions Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {allTransactions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Type</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Ticker</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Action/Strategy</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Quantity</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Amount</th>
                  {!selectedAccountId && (
                    <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Account</th>
                  )}
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
                    <td className="py-3 px-4 text-sm text-gray-900 text-right">
                      {transaction.type === 'stock'
                        ? `${(transaction as any).shares} shares`
                        : `${(transaction as any).contracts} contracts`}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900 text-right">
                      {transaction.type === 'stock'
                        ? formatCurrency((transaction as any).totalAmount)
                        : formatCurrency((transaction as any).totalPremium)}
                    </td>
                    {!selectedAccountId && (
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {accounts.find(a => a.id === transaction.accountId)?.name}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg">No transactions found</p>
            <p className="text-gray-400 text-sm mt-2">Try adjusting your filters</p>
          </div>
        )}
      </div>
      
      {/* Summary */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Summary</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-sm text-gray-600">Total Transactions</p>
            <p className="text-2xl font-bold text-gray-900">{allTransactions.length}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Stock Transactions</p>
            <p className="text-2xl font-bold text-blue-600">
              {allTransactions.filter(t => t.type === 'stock').length}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Option Transactions</p>
            <p className="text-2xl font-bold text-purple-600">
              {allTransactions.filter(t => t.type === 'option').length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Transactions;
