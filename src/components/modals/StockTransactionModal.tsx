import React, { useState, useEffect, useMemo } from 'react';
import type { StockTransaction } from '../../types';
import { useAppContext } from '../../context/AppContext';
import Modal from '../common/Modal';

interface StockTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: StockTransaction; // If provided, we're editing
}

const StockTransactionModal: React.FC<StockTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction
}) => {
  const {
    accounts,
    selectedAccountId,
    stockPositions,
    addStockTransaction,
    updateStockTransaction
  } = useAppContext();

  const [formData, setFormData] = useState({
    accountId: selectedAccountId || '',
    date: new Date().toISOString().split('T')[0],
    action: 'buy' as StockTransaction['action'],
    ticker: '',
    shares: 0,
    pricePerShare: 0,
    fees: 0,
    notes: '',
    tagIds: [] as string[]
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load transaction data if editing
  useEffect(() => {
    if (transaction) {
      setFormData({
        accountId: transaction.accountId,
        date: transaction.date.split('T')[0],
        action: transaction.action,
        ticker: transaction.ticker,
        shares: transaction.shares,
        pricePerShare: transaction.pricePerShare,
        fees: transaction.fees || 0,
        notes: transaction.notes || '',
        tagIds: transaction.tagIds || []
      });
    } else {
      // Reset form for new transaction
      setFormData({
        accountId: selectedAccountId || '',
        date: new Date().toISOString().split('T')[0],
        action: 'buy',
        ticker: '',
        shares: 0,
        pricePerShare: 0,
        fees: 0,
        notes: '',
        tagIds: []
      });
    }
    setErrors({});
  }, [transaction, selectedAccountId, isOpen]);

  const totalAmount = useMemo(() => {
    return formData.shares * formData.pricePerShare;
  }, [formData.shares, formData.pricePerShare]);

  const currentPosition = useMemo(() => {
    if (!formData.ticker || !formData.accountId) return null;
    return stockPositions.find(
      p => p.ticker === formData.ticker && p.accountId === formData.accountId
    );
  }, [stockPositions, formData.ticker, formData.accountId]);

  const canSell = useMemo(() => {
    if (formData.action !== 'sell' && formData.action !== 'transfer-out') return true;
    if (!currentPosition) return false;
    return currentPosition.shares >= formData.shares;
  }, [formData.action, formData.shares, currentPosition]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.accountId) {
      newErrors.accountId = 'Please select an account';
    }
    if (!formData.ticker) {
      newErrors.ticker = 'Ticker is required';
    }
    if (formData.shares <= 0) {
      newErrors.shares = 'Shares must be greater than 0';
    }
    if (formData.pricePerShare <= 0) {
      newErrors.pricePerShare = 'Price must be greater than 0';
    }
    if (!canSell) {
      newErrors.shares = `Insufficient shares. You own ${currentPosition?.shares || 0} shares.`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const transactionData: Omit<StockTransaction, 'id'> = {
      accountId: formData.accountId,
      date: new Date(formData.date).toISOString(),
      action: formData.action,
      ticker: formData.ticker.toUpperCase(),
      shares: formData.shares,
      pricePerShare: formData.pricePerShare,
      totalAmount,
      fees: formData.fees,
      notes: formData.notes,
      tagIds: formData.tagIds
    };

    if (transaction) {
      updateStockTransaction(transaction.id, transactionData);
    } else {
      addStockTransaction(transactionData);
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={transaction ? 'Edit Stock Transaction' : 'Add Stock Transaction'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Account Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Account *
          </label>
          <select
            value={formData.accountId}
            onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
            className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Account</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} - ${account.currentCash.toFixed(2)}
              </option>
            ))}
          </select>
          {errors.accountId && (
            <p className="text-sm text-red-400 mt-1">{errors.accountId}</p>
          )}
        </div>

        {/* Date and Action */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Action *
            </label>
            <select
              value={formData.action}
              onChange={(e) => setFormData({ ...formData, action: e.target.value as StockTransaction['action'] })}
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
              <option value="dividend">Dividend</option>
              <option value="split">Split</option>
              <option value="transfer-in">Transfer In</option>
              <option value="transfer-out">Transfer Out</option>
            </select>
          </div>
        </div>

        {/* Ticker - Smart Position Selector for Sell */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {formData.action === 'sell' ? 'Select Position to Sell *' : 'Ticker Symbol *'}
          </label>
          {formData.action === 'sell' ? (
            <>
              <select
                value={formData.ticker}
                onChange={(e) => {
                  const selectedPosition = stockPositions.find(
                    p => p.ticker === e.target.value && p.accountId === formData.accountId
                  );
                  setFormData({
                    ...formData,
                    ticker: e.target.value,
                    pricePerShare: selectedPosition?.averageCostBasis || 0
                  });
                }}
                className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select a position --</option>
                {stockPositions
                  .filter(p => p.accountId === formData.accountId && p.shares > 0)
                  .map(position => (
                    <option key={position.ticker} value={position.ticker}>
                      {position.ticker} ({position.shares} shares available @ ${position.averageCostBasis.toFixed(2)})
                    </option>
                  ))}
              </select>
              {stockPositions.filter(p => p.accountId === formData.accountId && p.shares > 0).length === 0 && (
                <p className="text-sm text-yellow-400 mt-1">
                  No stock positions available in this account to sell
                </p>
              )}
            </>
          ) : (
            <input
              type="text"
              value={formData.ticker}
              onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
              placeholder="AAPL"
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {errors.ticker && (
            <p className="text-sm text-red-400 mt-1">{errors.ticker}</p>
          )}
          {currentPosition && formData.action !== 'sell' && (
            <p className="text-sm text-gray-400 mt-1">
              Current position: {currentPosition.shares} shares @ ${currentPosition.averageCostBasis.toFixed(2)}
            </p>
          )}
        </div>

        {/* Shares and Price */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Shares *
            </label>
            <input
              type="number"
              value={formData.shares || ''}
              onChange={(e) => setFormData({ ...formData, shares: parseFloat(e.target.value) || 0 })}
              step="0.01"
              min="0"
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.shares && (
              <p className="text-sm text-red-400 mt-1">{errors.shares}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Price per Share *
            </label>
            <input
              type="number"
              value={formData.pricePerShare || ''}
              onChange={(e) => setFormData({ ...formData, pricePerShare: parseFloat(e.target.value) || 0 })}
              step="0.01"
              min="0"
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.pricePerShare && (
              <p className="text-sm text-red-400 mt-1">{errors.pricePerShare}</p>
            )}
          </div>
        </div>

        {/* Fees */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Fees
          </label>
          <input
            type="number"
            value={formData.fees || ''}
            onChange={(e) => setFormData({ ...formData, fees: parseFloat(e.target.value) || 0 })}
            step="0.01"
            min="0"
            className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Total Amount */}
        <div className="bg-gray-700 p-4 rounded-md">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-300">Total Amount:</span>
            <span className="text-lg font-bold text-white">
              ${totalAmount.toFixed(2)}
            </span>
          </div>
          {formData.fees > 0 && (
            <div className="flex justify-between items-center mt-2">
              <span className="text-sm text-gray-400">With Fees:</span>
              <span className="text-sm font-medium text-white">
                ${(totalAmount + formData.fees).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Notes
          </label>
          <textarea
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            rows={3}
            className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Optional notes about this transaction..."
          />
        </div>

        {/* Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-md border border-gray-600 text-gray-300 hover:bg-gray-700 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-6 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            {transaction ? 'Update Transaction' : 'Add Transaction'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default StockTransactionModal;
