import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import {
  formatCurrency,
  daysUntilExpiration,
  calculateOptionsAnalytics,
  calculateAnnualizedReturn
} from '../utils/calculations';
import { Plus, Search, TrendingUp, DollarSign, Target, Calendar, Edit2, Trash2, X, LayoutGrid, List } from 'lucide-react';
import type { OptionTransaction } from '../types';
import OptionTransactionModal from '../components/modals/OptionTransactionModal';

const Options: React.FC = () => {
  const {
    optionPositions,
    optionTransactions,
    closeOptionPosition,
    deleteOptionTransaction,
    selectedAccountId,
    accounts
  } = useAppContext();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<OptionTransaction | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [closingPositionId, setClosingPositionId] = useState<string | null>(null);
  const [closingPrice, setClosingPrice] = useState('');
  const [closingFees, setClosingFees] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');

  const analytics = calculateOptionsAnalytics(
    optionTransactions, optionPositions, selectedAccountId || undefined
  );

  const filteredPositions = optionPositions.filter(position => {
    const matchesSearch = position.ticker.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' ||
      (statusFilter === 'open' && position.status === 'open') ||
      (statusFilter === 'closed' && (position.status === 'closed' || position.status === 'expired' || position.status === 'assigned'));
    return matchesSearch && matchesStatus;
  });

  const openPositions = filteredPositions.filter(p => p.status === 'open');
  const expiringSoon = openPositions.filter(p => daysUntilExpiration(p.expirationDate) <= 7);
  const closedPositions = filteredPositions.filter(p => p.status !== 'open');

  const handleClosePosition = (positionId: string, closeType: 'closed' | 'expired' | 'assigned') => {
    if (closeType === 'closed') {
      // For manual close, use the entered closing price and fees
      const price = parseFloat(closingPrice);
      const fees = parseFloat(closingFees) || 0;
      if (isNaN(price) || price < 0) {
        alert('Please enter a valid closing price per share');
        return;
      }
      if (fees < 0) {
        alert('Fees cannot be negative');
        return;
      }
      closeOptionPosition(positionId, closeType, price, fees);
    } else {
      // For expired/assigned, no closing price needed
      closeOptionPosition(positionId, closeType);
    }
    setClosingPositionId(null);
    setClosingPrice('');
    setClosingFees('');
  };

  const handleDeletePosition = (positionId: string) => {
    const position = optionPositions.find(p => p.id === positionId);
    if (!position) return;

    const relatedTransactions = optionTransactions.filter(t =>
      t.ticker === position.ticker &&
      t.strikePrice === position.strikePrice &&
      t.expirationDate === position.expirationDate &&
      t.accountId === position.accountId
    );

    if (confirm(`Delete this position and ${relatedTransactions.length} related transaction(s)? This cannot be undone.`)) {
      relatedTransactions.forEach(t => deleteOptionTransaction(t.id));
    }
  };

  const handleEditTransaction = (positionId: string) => {
    const position = optionPositions.find(p => p.id === positionId);
    if (!position) return;

    const txn = optionTransactions.find(t =>
      t.ticker === position.ticker &&
      t.strikePrice === position.strikePrice &&
      t.expirationDate === position.expirationDate &&
      t.accountId === position.accountId &&
      (t.action === 'sell-to-open' || t.action === 'buy-to-open')
    );

    if (txn) {
      setEditingTransaction(txn);
      setIsModalOpen(true);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-blue-900/30 text-blue-400';
      case 'expired': return 'bg-gray-700 text-gray-300';
      case 'assigned': return 'bg-purple-900/30 text-purple-400';
      case 'closed': return 'bg-green-900/30 text-green-400';
      default: return 'bg-gray-700 text-gray-300';
    }
  };

  const PositionCard = ({ position }: { position: typeof optionPositions[0] }) => {
    const account = accounts.find(a => a.id === position.accountId);
    const daysUntil = daysUntilExpiration(position.expirationDate);
    const isExpiringSoon = daysUntil <= 7 && position.status === 'open';
    
    // Find the original open transaction to determine if seller or buyer
    const openTxn = optionTransactions.find(t =>
      t.ticker === position.ticker &&
      t.strikePrice === position.strikePrice &&
      t.expirationDate === position.expirationDate &&
      t.accountId === position.accountId &&
      (t.action === 'sell-to-open' || t.action === 'buy-to-open')
    );
    
    // Calculate total days from open to expiration (not days remaining)
    const totalDays = openTxn
      ? Math.max(1, Math.round(
          (new Date(position.expirationDate).getTime() - new Date(openTxn.transactionDate).getTime()) / (1000 * 60 * 60 * 24)
        ))
      : Math.abs(daysUntil) || 1;
    
    const annualizedReturn = position.collateralRequired
      ? calculateAnnualizedReturn(
          position.totalPremium,
          position.collateralRequired,
          totalDays
        )
      : 0;
    const isClosing = closingPositionId === position.id;
    const isSeller = openTxn?.action === 'sell-to-open';

    return (
      <div className={`bg-gray-900 rounded-lg shadow p-6 border-l-4 border border-gray-800 ${
        isExpiringSoon ? 'border-l-yellow-500' : 'border-l-blue-500'
      }`}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {position.ticker} ${position.strikePrice} {position.optionType.toUpperCase()}
            </h3>
            <p className="text-sm text-gray-400">{position.strategy}</p>
            {!selectedAccountId && account && (
              <p className="text-xs text-blue-400 mt-1">{account.name}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(position.status)}`}>
              {position.status}
            </span>
            {position.status === 'open' && (
              <div className="flex gap-1">
                <button
                  onClick={() => handleEditTransaction(position.id)}
                  className="text-blue-400 hover:text-blue-300 p-1"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setClosingPositionId(isClosing ? null : position.id);
                    setClosingPrice('');
                  }}
                  className="text-yellow-400 hover:text-yellow-300 p-1"
                  title="Close position"
                >
                  <X className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeletePosition(position.id)}
                  className="text-red-400 hover:text-red-300 p-1"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )}
            {position.status !== 'open' && (
              <button
                onClick={() => handleDeletePosition(position.id)}
                className="text-red-400 hover:text-red-300 p-1"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Close Position Actions */}
        {isClosing && (
          <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700">
            <p className="text-sm text-gray-300 mb-3 font-medium">How was this position closed?</p>
            
            {/* Closing price input for manual close */}
            <div className="mb-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Closing price per share (for manual close)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingPrice}
                  onChange={(e) => setClosingPrice(e.target.value)}
                  placeholder="e.g., 1.50"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="text-xs text-gray-400 block mb-1">
                  Fees (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingFees}
                  onChange={(e) => setClosingFees(e.target.value)}
                  placeholder="e.g., 1.00"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              {closingPrice && !isNaN(parseFloat(closingPrice)) && (
                <div className="mt-2 text-xs text-gray-400">
                  <p>
                    Total close cost: {formatCurrency(parseFloat(closingPrice) * position.contracts * 100 + (parseFloat(closingFees) || 0))}
                  </p>
                  {isSeller && (
                    <p className={`font-semibold ${
                      position.totalPremium - parseFloat(closingPrice) * position.contracts * 100 - (openTxn?.fees || 0) - (parseFloat(closingFees) || 0) >= 0
                        ? 'text-green-400' : 'text-red-400'
                    }`}>
                      Estimated P&L: {formatCurrency(
                        position.totalPremium - parseFloat(closingPrice) * position.contracts * 100 - (openTxn?.fees || 0) - (parseFloat(closingFees) || 0)
                      )}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => handleClosePosition(position.id, 'closed')}
                className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
              >
                {isSeller ? 'Bought to Close' : 'Sold to Close'}
              </button>
              <button
                onClick={() => handleClosePosition(position.id, 'expired')}
                className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md hover:bg-gray-700"
              >
                Expired Worthless
              </button>
              <button
                onClick={() => handleClosePosition(position.id, 'assigned')}
                className="px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700"
              >
                Assigned
              </button>
              <button
                onClick={() => {
                  setClosingPositionId(null);
                  setClosingPrice('');
                }}
                className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm rounded-md hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>

            {/* Explanation of what each action does */}
            <div className="mt-3 text-xs text-gray-500 space-y-1">
              {isSeller ? (
                <>
                  <p><strong className="text-gray-400">Bought to Close:</strong> Pay to close the position. Enter closing price above.</p>
                  <p><strong className="text-gray-400">Expired Worthless:</strong> Keep full premium. No action needed.</p>
                  <p><strong className="text-gray-400">Assigned:</strong> {position.optionType === 'put' 
                    ? `Buy ${position.contracts * 100} shares of ${position.ticker} at $${position.strikePrice}. Stock position will be created.`
                    : `Sell ${position.contracts * 100} shares of ${position.ticker} at $${position.strikePrice}. Stock will be removed.`
                  }</p>
                </>
              ) : (
                <>
                  <p><strong className="text-gray-400">Sold to Close:</strong> Sell the option to close. Enter closing price above.</p>
                  <p><strong className="text-gray-400">Expired Worthless:</strong> Lose full premium paid.</p>
                  <p><strong className="text-gray-400">Assigned:</strong> Exercise the option.</p>
                </>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-gray-400">Contracts</p>
            <p className="text-sm font-semibold text-white">{position.contracts}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Premium</p>
            <p className="text-sm font-semibold text-white">
              {formatCurrency(position.totalPremium)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Expiration</p>
            <p className="text-sm font-semibold text-white">
              {new Date(position.expirationDate).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Days Until</p>
            <p className={`text-sm font-semibold ${
              isExpiringSoon ? 'text-yellow-400' : 'text-white'
            }`}>
              {daysUntil >= 0 ? daysUntil : 'Expired'}
            </p>
          </div>
        </div>

        {position.collateralRequired && position.status === 'open' && (
          <div className="bg-gray-800 rounded-lg p-3 mb-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Collateral</span>
              <span className="text-sm font-semibold text-white">
                {formatCurrency(position.collateralRequired)}
              </span>
            </div>
            {annualizedReturn > 0 && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">Annualized Return</span>
                <span className="text-xs font-semibold text-green-400">
                  {annualizedReturn.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
        )}

        {position.realizedPL !== undefined && position.status !== 'open' && (
          <div className={`text-sm font-semibold ${
            position.realizedPL >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            Realized P&L: {formatCurrency(position.realizedPL)}
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

  const PositionTable = ({ positions }: { positions: typeof optionPositions }) => {
    return (
      <div className="bg-gray-900 rounded-lg shadow overflow-hidden border border-gray-800">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-800 border-b border-gray-700">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Position</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Strategy</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Contracts</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Premium</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Expiration</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Collateral</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Ann. Return</th>
                {!selectedAccountId && (
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-300">Account</th>
                )}
                <th className="text-center py-3 px-4 text-sm font-medium text-gray-300">Status</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(position => {
                const account = accounts.find(a => a.id === position.accountId);
                const daysUntil = daysUntilExpiration(position.expirationDate);
                const openTxn = optionTransactions.find(t =>
                  t.ticker === position.ticker &&
                  t.strikePrice === position.strikePrice &&
                  t.expirationDate === position.expirationDate &&
                  t.accountId === position.accountId &&
                  (t.action === 'sell-to-open' || t.action === 'buy-to-open')
                );
                const totalDays = openTxn
                  ? Math.max(1, Math.round(
                      (new Date(position.expirationDate).getTime() - new Date(openTxn.transactionDate).getTime()) / (1000 * 60 * 60 * 24)
                    ))
                  : Math.abs(daysUntil) || 1;
                const annualizedReturn = position.collateralRequired
                  ? calculateAnnualizedReturn(position.totalPremium, position.collateralRequired, totalDays)
                  : 0;

                return (
                  <tr key={position.id} className="border-b border-gray-800 hover:bg-gray-800">
                    <td className="py-3 px-4 text-sm text-white font-medium">
                      {position.ticker} ${position.strikePrice} {position.optionType.toUpperCase()}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-400">{position.strategy}</td>
                    <td className="py-3 px-4 text-sm text-right text-white">{position.contracts}</td>
                    <td className="py-3 px-4 text-sm text-right text-white">{formatCurrency(position.totalPremium)}</td>
                    <td className="py-3 px-4 text-sm text-white">
                      {new Date(position.expirationDate).toLocaleDateString()}
                      {position.status === 'open' && (
                        <span className={`ml-2 text-xs ${
                          daysUntil <= 7 ? 'text-yellow-400' : 'text-gray-500'
                        }`}>
                          ({daysUntil}d)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-white">
                      {position.collateralRequired ? formatCurrency(position.collateralRequired) : '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-right text-green-400">
                      {annualizedReturn > 0 ? `${annualizedReturn.toFixed(2)}%` : '-'}
                    </td>
                    {!selectedAccountId && (
                      <td className="py-3 px-4 text-sm text-blue-400">{account?.name}</td>
                    )}
                    <td className="py-3 px-4 text-center">
                      <span className={`inline-block px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(position.status)}`}>
                        {position.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        {position.status === 'open' && (
                          <>
                            <button
                              onClick={() => handleEditTransaction(position.id)}
                              className="text-blue-400 hover:text-blue-300 p-1"
                              title="Edit"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                setClosingPositionId(position.id);
                                setClosingPrice('');
                              }}
                              className="text-yellow-400 hover:text-yellow-300 p-1"
                              title="Close position"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleDeletePosition(position.id)}
                          className="text-red-400 hover:text-red-300 p-1"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Options Positions</h1>
          <p className="text-gray-400 mt-1">
            {selectedAccountId
              ? `Viewing: ${accounts.find(a => a.id === selectedAccountId)?.name}`
              : 'Viewing: All Accounts'}
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTransaction(undefined);
            setIsModalOpen(true);
          }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Option
        </button>
      </div>

      {/* Analytics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Net Premium</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(analytics.netPremium)}
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
              <p className="text-sm text-gray-400">Win Rate</p>
              <p className="text-2xl font-bold text-white mt-1">
                {analytics.winRate.toFixed(1)}%
              </p>
            </div>
            <div className="bg-blue-900/50 p-3 rounded-full">
              <Target className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Annualized Return</p>
              <p className="text-2xl font-bold text-white mt-1">
                {analytics.annualizedReturn.toFixed(2)}%
              </p>
            </div>
            <div className="bg-purple-900/50 p-3 rounded-full">
              <TrendingUp className="w-6 h-6 text-purple-400" />
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">Active Collateral</p>
              <p className="text-2xl font-bold text-white mt-1">
                {formatCurrency(analytics.activeCollateral)}
              </p>
            </div>
            <div className="bg-orange-900/50 p-3 rounded-full">
              <Calendar className="w-6 h-6 text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Additional Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <p className="text-sm text-gray-400 mb-2">Avg Return Per Trade</p>
          <p className="text-xl font-bold text-white">
            {formatCurrency(analytics.averageReturnPerTrade)}
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <p className="text-sm text-gray-400 mb-2">Assignment Rate</p>
          <p className="text-xl font-bold text-white">
            {analytics.assignmentRate.toFixed(1)}%
          </p>
        </div>

        <div className="bg-gray-900 rounded-lg shadow p-6 border border-gray-800">
          <p className="text-sm text-gray-400 mb-2">Avg Days to Close</p>
          <p className="text-xl font-bold text-white">
            {analytics.averageDaysToClose.toFixed(0)} days
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="bg-gray-900 rounded-lg shadow p-4 border border-gray-800">
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
            {(['all', 'open', 'closed'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                className={`px-4 py-2 rounded-md font-medium transition-colors capitalize ${
                  statusFilter === filter
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {filter}
              </button>
            ))}
            <div className="border-l border-gray-700 mx-2"></div>
            <button
              onClick={() => setViewMode('card')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'card'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="Card view"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-md transition-colors ${
                viewMode === 'table'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
              title="Table view"
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Expiring Soon Alert */}
      {expiringSoon.length > 0 && (
        <div className="bg-yellow-900/30 border border-yellow-700 p-4 rounded-lg">
          <div className="flex items-center">
            <Calendar className="w-5 h-5 text-yellow-400 mr-3" />
            <div>
              <p className="font-semibold text-yellow-300">
                {expiringSoon.length} position{expiringSoon.length > 1 ? 's' : ''} expiring within 7 days
              </p>
              <p className="text-sm text-yellow-400/80">Review these positions for potential actions</p>
            </div>
          </div>
        </div>
      )}

      {/* Open Positions */}
      {openPositions.length > 0 && (statusFilter === 'all' || statusFilter === 'open') && (
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">
            Open Positions ({openPositions.length})
          </h2>
          {viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {openPositions.map(position => (
                <PositionCard key={position.id} position={position} />
              ))}
            </div>
          ) : (
            <PositionTable positions={openPositions} />
          )}
        </div>
      )}

      {/* Closed Positions */}
      {closedPositions.length > 0 && (statusFilter === 'all' || statusFilter === 'closed') && (
        <div>
          <h2 className="text-xl font-semibold text-white mb-4">
            Closed Positions ({closedPositions.length})
          </h2>
          {viewMode === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {closedPositions.map(position => (
                <PositionCard key={position.id} position={position} />
              ))}
            </div>
          ) : (
            <PositionTable positions={closedPositions} />
          )}
        </div>
      )}

      {/* Empty State */}
      {filteredPositions.length === 0 && (
        <div className="bg-gray-900 rounded-lg shadow p-12 text-center border border-gray-800">
          <p className="text-gray-400 text-lg">No options positions yet</p>
          <p className="text-gray-500 text-sm mt-2">Add your first option transaction to get started</p>
        </div>
      )}

      {/* Modal */}
      <OptionTransactionModal
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

export default Options;
