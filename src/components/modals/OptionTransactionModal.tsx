import React, { useState, useEffect, useMemo } from 'react';
import type { OptionTransaction } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { calculateAnnualizedReturn, daysUntilExpiration } from '../../utils/calculations';
import Modal from '../common/Modal';

interface OptionTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  transaction?: OptionTransaction; // If provided, we're editing
}

const OptionTransactionModal: React.FC<OptionTransactionModalProps> = ({
  isOpen,
  onClose,
  transaction
}) => {
  const {
    accounts,
    selectedAccountId,
    stockPositions,
    optionPositions,
    addOptionTransaction,
    updateOptionTransaction
  } = useAppContext();

  const [formData, setFormData] = useState({
    accountId: selectedAccountId || '',
    transactionDate: new Date().toISOString().split('T')[0],
    action: 'sell-to-open' as OptionTransaction['action'],
    ticker: '',
    strategy: 'covered-call' as OptionTransaction['strategy'],
    optionType: 'call' as 'call' | 'put',
    contracts: 1,
    strikePrice: 0,
    expirationDate: '',
    premiumPerShare: 0,
    fees: 0,
    notes: '',
    status: 'open' as OptionTransaction['status']
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load transaction data if editing
  useEffect(() => {
    if (transaction) {
      setFormData({
        accountId: transaction.accountId,
        transactionDate: transaction.transactionDate.split('T')[0],
        action: transaction.action,
        ticker: transaction.ticker,
        strategy: transaction.strategy,
        optionType: transaction.optionType,
        contracts: transaction.contracts,
        strikePrice: transaction.strikePrice,
        expirationDate: transaction.expirationDate.split('T')[0],
        premiumPerShare: transaction.premiumPerShare,
        fees: transaction.fees || 0,
        notes: transaction.notes || '',
        status: transaction.status
      });
    } else {
      // Reset form for new transaction
      setFormData({
        accountId: selectedAccountId || '',
        transactionDate: new Date().toISOString().split('T')[0],
        action: 'sell-to-open',
        ticker: '',
        strategy: 'covered-call',
        optionType: 'call',
        contracts: 1,
        strikePrice: 0,
        expirationDate: '',
        premiumPerShare: 0,
        fees: 0,
        notes: '',
        status: 'open'
      });
    }
    setErrors({});
  }, [transaction, selectedAccountId, isOpen]);

  // Auto-fill option type and action based on strategy
  useEffect(() => {
    switch (formData.strategy) {
      case 'covered-call':
        setFormData(prev => ({ ...prev, optionType: 'call', action: 'sell-to-open' }));
        break;
      case 'cash-secured-put':
        setFormData(prev => ({ ...prev, optionType: 'put', action: 'sell-to-open' }));
        break;

      case 'long-call':
        setFormData(prev => ({ ...prev, optionType: 'call', action: 'buy-to-open' }));
        break;
      case 'long-put':
        setFormData(prev => ({ ...prev, optionType: 'put', action: 'buy-to-open' }));
        break;
    }
  }, [formData.strategy]);

  const totalPremium = useMemo(() => {
    return formData.premiumPerShare * formData.contracts * 100;
  }, [formData.premiumPerShare, formData.contracts]);

  const collateralRequired = useMemo(() => {
    if (formData.strategy === 'cash-secured-put' && formData.strikePrice && formData.contracts) {
      return formData.strikePrice * formData.contracts * 100;
    }
    return 0;
  }, [formData.strategy, formData.strikePrice, formData.contracts]);

  const selectedAccount = useMemo(() => {
    return accounts.find(a => a.id === formData.accountId);
  }, [accounts, formData.accountId]);

  const stockPosition = useMemo(() => {
    if (!formData.ticker || !formData.accountId) return null;
    return stockPositions.find(
      p => p.ticker === formData.ticker && p.accountId === formData.accountId
    );
  }, [stockPositions, formData.ticker, formData.accountId]);

  const availableCash = useMemo(() => {
    if (!selectedAccount) return 0;
    const activeCollateral = optionPositions
      .filter(p => p.accountId === selectedAccount.id && p.status === 'open')
      .reduce((sum, p) => sum + (p.collateralRequired || 0), 0);
    return selectedAccount.currentCash - activeCollateral;
  }, [selectedAccount, optionPositions]);

  const hasSufficientShares = useMemo(() => {
    if (formData.strategy !== 'covered-call') return true;
    if (!stockPosition) return false;
    return stockPosition.shares >= formData.contracts * 100;
  }, [formData.strategy, formData.contracts, stockPosition]);

  const hasSufficientCash = useMemo(() => {
    if (collateralRequired === 0) return true;
    return availableCash >= collateralRequired;
  }, [collateralRequired, availableCash]);

  const annualizedReturn = useMemo(() => {
    if (!formData.expirationDate || !totalPremium || !collateralRequired) return 0;
    const daysToExp = daysUntilExpiration(formData.expirationDate);
    return calculateAnnualizedReturn(totalPremium, collateralRequired, daysToExp);
  }, [formData.expirationDate, totalPremium, collateralRequired]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.accountId) {
      newErrors.accountId = 'Please select an account';
    }
    if (!formData.ticker) {
      newErrors.ticker = 'Ticker is required';
    }
    if (formData.contracts <= 0) {
      newErrors.contracts = 'Contracts must be greater than 0';
    }
    if (formData.strikePrice <= 0) {
      newErrors.strikePrice = 'Strike price must be greater than 0';
    }
    if (!formData.expirationDate) {
      newErrors.expirationDate = 'Expiration date is required';
    }
    if (formData.premiumPerShare <= 0) {
      newErrors.premiumPerShare = 'Premium must be greater than 0';
    }
    if (!hasSufficientShares) {
      newErrors.contracts = `Insufficient shares. You own ${stockPosition?.shares || 0} shares. Need ${formData.contracts * 100}.`;
    }
    if (!hasSufficientCash) {
      newErrors.strikePrice = `Insufficient cash. Available: $${availableCash.toFixed(2)}. Required: $${collateralRequired.toFixed(2)}.`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const transactionData: Omit<OptionTransaction, 'id'> = {
      accountId: formData.accountId,
      transactionDate: new Date(formData.transactionDate).toISOString(),
      action: formData.action,
      ticker: formData.ticker.toUpperCase(),
      strategy: formData.strategy,
      optionType: formData.optionType,
      contracts: formData.contracts,
      strikePrice: formData.strikePrice,
      expirationDate: new Date(formData.expirationDate).toISOString(),
      premiumPerShare: formData.premiumPerShare,
      totalPremium,
      fees: formData.fees,
      notes: formData.notes,
      status: formData.status,
      collateralRequired: collateralRequired > 0 ? collateralRequired : undefined
    };

    if (transaction) {
      updateOptionTransaction(transaction.id, transactionData);
    } else {
      addOptionTransaction(transactionData);
    }

    onClose();
  };

  const setExpirationPreset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    setFormData({ ...formData, expirationDate: date.toISOString().split('T')[0] });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={transaction ? 'Edit Option Transaction' : 'Add Option Transaction'}
      size="xl"
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
          {selectedAccount && (
            <p className="text-sm text-gray-400 mt-1">
              Available Cash: ${availableCash.toFixed(2)}
            </p>
          )}
        </div>

        {/* Date and Strategy */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Date *
            </label>
            <input
              type="date"
              value={formData.transactionDate}
              onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Strategy *
            </label>
            <select
              value={formData.strategy}
              onChange={(e) => setFormData({ ...formData, strategy: e.target.value as OptionTransaction['strategy'] })}
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="covered-call">Covered Call</option>
              <option value="cash-secured-put">Cash-Secured Put</option>
              <option value="protective-put">Protective Put</option>
              <option value="long-call">Long Call</option>
              <option value="long-put">Long Put</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        {/* Ticker - Smart Position Selector for Closing */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            {(formData.action === 'buy-to-close' || formData.action === 'sell-to-close')
              ? 'Select Position to Close *'
              : 'Ticker Symbol *'}
          </label>
          {(formData.action === 'buy-to-close' || formData.action === 'sell-to-close') ? (
            <>
              <select
                value={`${formData.ticker}|${formData.strikePrice}|${formData.expirationDate}|${formData.optionType}`}
                onChange={(e) => {
                  const [ticker, strike, exp, type] = e.target.value.split('|');
                  const selectedPosition = optionPositions.find(
                    p => p.ticker === ticker &&
                         p.strikePrice === parseFloat(strike) &&
                         p.expirationDate === exp &&
                         p.optionType === type &&
                         p.accountId === formData.accountId &&
                         p.status === 'open'
                  );
                  if (selectedPosition) {
                    // If editing, add back the contracts from the original transaction
                    const availableContracts = transaction 
                      ? selectedPosition.contracts + transaction.contracts
                      : selectedPosition.contracts;
                    
                    setFormData({
                      ...formData,
                      ticker,
                      strikePrice: parseFloat(strike),
                      expirationDate: exp,
                      optionType: type as 'call' | 'put',
                      strategy: selectedPosition.strategy,
                      contracts: Math.min(formData.contracts, availableContracts),
                      premiumPerShare: selectedPosition.totalPremium / (selectedPosition.contracts * 100) / 2 // Default to half premium for closing
                    });
                  }
                }}
                className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select a position to close --</option>
                {optionPositions
                  .filter(p => p.accountId === formData.accountId && p.status === 'open')
                  .map(position => {
                    const key = `${position.ticker}|${position.strikePrice}|${position.expirationDate}|${position.optionType}`;
                    return (
                      <option key={key} value={key}>
                        {position.ticker} ${position.strikePrice} {position.optionType.toUpperCase()} - {position.contracts} contracts - Exp: {new Date(position.expirationDate).toLocaleDateString()}
                      </option>
                    );
                  })}
              </select>
              {optionPositions.filter(p => p.accountId === formData.accountId && p.status === 'open').length === 0 && (
                <p className="text-sm text-yellow-400 mt-1">
                  No open option positions available in this account to close
                </p>
              )}
              {formData.ticker && (
                <p className="text-sm text-blue-400 mt-1">
                  💡 You can close a partial position by adjusting the contracts field below
                </p>
              )}
            </>
          ) : (
            <>
              <input
                type="text"
                value={formData.ticker}
                onChange={(e) => setFormData({ ...formData, ticker: e.target.value.toUpperCase() })}
                placeholder="AAPL"
                className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {stockPosition && (
                <p className="text-sm text-gray-400 mt-1">
                  Current position: {stockPosition.shares} shares @ ${stockPosition.averageCostBasis.toFixed(2)}
                </p>
              )}
            </>
          )}
          {errors.ticker && (
            <p className="text-sm text-red-400 mt-1">{errors.ticker}</p>
          )}
        </div>

        {/* Option Type, Action, Contracts */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Option Type *
            </label>
            <select
              value={formData.optionType}
              onChange={(e) => setFormData({ ...formData, optionType: e.target.value as 'call' | 'put' })}
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="call">Call</option>
              <option value="put">Put</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Action *
            </label>
            <select
              value={formData.action}
              onChange={(e) => setFormData({ ...formData, action: e.target.value as OptionTransaction['action'] })}
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="sell-to-open">Sell to Open</option>
              <option value="buy-to-open">Buy to Open</option>
              <option value="sell-to-close">Sell to Close</option>
              <option value="buy-to-close">Buy to Close</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Contracts *
            </label>
            <input
              type="number"
              value={formData.contracts || ''}
              onChange={(e) => setFormData({ ...formData, contracts: parseInt(e.target.value) || 0 })}
              min="1"
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.contracts && (
              <p className="text-sm text-red-400 mt-1">{errors.contracts}</p>
            )}
          </div>
        </div>

        {/* Strike Price and Premium */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Strike Price *
            </label>
            <input
              type="number"
              value={formData.strikePrice || ''}
              onChange={(e) => setFormData({ ...formData, strikePrice: parseFloat(e.target.value) || 0 })}
              step="0.01"
              min="0"
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.strikePrice && (
              <p className="text-sm text-red-400 mt-1">{errors.strikePrice}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Premium per Share *
            </label>
            <input
              type="number"
              value={formData.premiumPerShare || ''}
              onChange={(e) => setFormData({ ...formData, premiumPerShare: parseFloat(e.target.value) || 0 })}
              step="0.01"
              min="0"
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.premiumPerShare && (
              <p className="text-sm text-red-400 mt-1">{errors.premiumPerShare}</p>
            )}
          </div>
        </div>

        {/* Expiration Date with Presets */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Expiration Date *
          </label>
          <div className="flex gap-2">
            <input
              type="date"
              value={formData.expirationDate}
              onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
              className="flex-1 px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => setExpirationPreset(7)}
              className="px-3 py-2 rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm"
            >
              +7d
            </button>
            <button
              type="button"
              onClick={() => setExpirationPreset(14)}
              className="px-3 py-2 rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm"
            >
              +14d
            </button>
            <button
              type="button"
              onClick={() => setExpirationPreset(30)}
              className="px-3 py-2 rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm"
            >
              +30d
            </button>
            <button
              type="button"
              onClick={() => setExpirationPreset(45)}
              className="px-3 py-2 rounded-md bg-gray-700 text-gray-300 hover:bg-gray-600 text-sm"
            >
              +45d
            </button>
          </div>
          {errors.expirationDate && (
            <p className="text-sm text-red-400 mt-1">{errors.expirationDate}</p>
          )}
        </div>

        {/* Fees and Status */}
        <div className="grid grid-cols-2 gap-4">
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

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as OptionTransaction['status'] })}
              className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="expired">Expired</option>
              <option value="assigned">Assigned</option>
            </select>
          </div>
        </div>

        {/* Calculations Summary */}
        <div className="bg-gray-700 p-4 rounded-md space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-300">Total Premium:</span>
            <span className="text-lg font-bold text-white">
              ${totalPremium.toFixed(2)}
            </span>
          </div>
          {collateralRequired > 0 && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Collateral Required:</span>
                <span className="text-sm font-medium text-white">
                  ${collateralRequired.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-400">Return on Collateral:</span>
                <span className="text-sm font-medium text-white">
                  {((totalPremium / collateralRequired) * 100).toFixed(2)}%
                </span>
              </div>
              {formData.expirationDate && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Annualized Return:</span>
                  <span className="text-sm font-medium text-green-400">
                    {annualizedReturn.toFixed(2)}%
                  </span>
                </div>
              )}
            </>
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

export default OptionTransactionModal;
