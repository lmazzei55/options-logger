import React, { useState, useEffect } from 'react';
import type { OptionTransaction, OptionStrategy, OptionAction, OptionStatus } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { Calculator } from 'lucide-react';

interface OptionTransactionFormProps {
  transaction?: OptionTransaction;
  onSave: (transaction: Omit<OptionTransaction, 'id'> | OptionTransaction) => void;
  onCancel: () => void;
}

export const OptionTransactionForm: React.FC<OptionTransactionFormProps> = ({
  transaction,
  onSave,
  onCancel
}) => {
  const { accounts, stockPositions, tags } = useAppContext();
  
  const [formData, setFormData] = useState({
    accountId: transaction?.accountId || accounts[0]?.id || '',
    ticker: transaction?.ticker || '',
    strategy: transaction?.strategy || 'cash-secured-put',
    optionType: transaction?.optionType || 'put',
    action: transaction?.action || 'sell-to-open',
    contracts: transaction?.contracts.toString() || '',
    strikePrice: transaction?.strikePrice.toString() || '',
    premiumPerShare: transaction?.premiumPerShare.toString() || '',
    fees: transaction?.fees.toString() || '0',
    expirationDate: transaction?.expirationDate || '',
    transactionDate: transaction?.transactionDate || new Date().toISOString().split('T')[0],
    status: transaction?.status || 'open',
    notes: transaction?.notes || '',
    tagIds: transaction?.tagIds || []
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const showCalculations = true;
  
  // Calculate total premium
  const totalPremium = formData.contracts && formData.premiumPerShare
    ? parseFloat(formData.contracts) * 100 * parseFloat(formData.premiumPerShare)
    : 0;
  
  // Calculate collateral required for cash-secured puts
  const collateralRequired = formData.strategy === 'cash-secured-put' && formData.contracts && formData.strikePrice
    ? parseFloat(formData.contracts) * 100 * parseFloat(formData.strikePrice)
    : 0;
  
  // Calculate annualized return estimate
  const daysToExpiration = formData.expirationDate && formData.transactionDate
    ? Math.ceil((new Date(formData.expirationDate).getTime() - new Date(formData.transactionDate).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  const annualizedReturn = collateralRequired > 0 && daysToExpiration > 0
    ? (totalPremium / collateralRequired) * (365 / daysToExpiration) * 100
    : 0;
  
  // Get available shares for covered calls
  const availableShares = formData.ticker && formData.accountId
    ? stockPositions.find(p => p.ticker === formData.ticker && p.accountId === formData.accountId)?.shares || 0
    : 0;
  
  const requiredShares = formData.contracts ? parseFloat(formData.contracts) * 100 : 0;
  
  // Get account cash for validation
  const accountCash = accounts.find(a => a.id === formData.accountId)?.currentCash || 0;
  
  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error for this field
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };
  
  // Update option type based on strategy
  useEffect(() => {
    if (formData.strategy === 'cash-secured-put' || formData.strategy === 'long-put') {
      handleChange('optionType', 'put');
    } else if (formData.strategy === 'covered-call' || formData.strategy === 'long-call') {
      handleChange('optionType', 'call');
    }
  }, [formData.strategy]);
  
  // Update action based on strategy
  useEffect(() => {
    if (formData.strategy === 'cash-secured-put' || formData.strategy === 'covered-call') {
      handleChange('action', 'sell-to-open');
    } else if (formData.strategy === 'long-call' || formData.strategy === 'long-put') {
      handleChange('action', 'buy-to-open');
    }
  }, [formData.strategy]);
  
  // Set expiration date presets
  const setExpirationPreset = (days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    handleChange('expirationDate', date.toISOString().split('T')[0]);
  };
  
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.accountId) newErrors.accountId = 'Account is required';
    if (!formData.ticker) newErrors.ticker = 'Ticker is required';
    if (!formData.contracts || parseFloat(formData.contracts) <= 0) {
      newErrors.contracts = 'Contracts must be greater than 0';
    }
    if (!formData.strikePrice || parseFloat(formData.strikePrice) <= 0) {
      newErrors.strikePrice = 'Strike price must be greater than 0';
    }
    if (!formData.premiumPerShare || parseFloat(formData.premiumPerShare) <= 0) {
      newErrors.premiumPerShare = 'Premium must be greater than 0';
    }
    if (!formData.expirationDate) newErrors.expirationDate = 'Expiration date is required';
    if (!formData.transactionDate) newErrors.transactionDate = 'Transaction date is required';
    
    // Validate covered call has enough shares
    if (formData.strategy === 'covered-call' && requiredShares > availableShares) {
      newErrors.contracts = `Insufficient shares. Need ${requiredShares}, have ${availableShares}`;
    }
    
    // Validate cash-secured put has enough cash
    if (formData.strategy === 'cash-secured-put' && formData.action === 'sell-to-open' && collateralRequired > accountCash) {
      newErrors.contracts = `Insufficient cash. Need $${collateralRequired.toFixed(2)}, have $${accountCash.toFixed(2)}`;
    }
    
    // Validate expiration date is in future
    if (formData.status === 'open' && new Date(formData.expirationDate) <= new Date()) {
      newErrors.expirationDate = 'Expiration date must be in the future for open positions';
    }
    
    // Validate transaction date not in future
    if (new Date(formData.transactionDate) > new Date()) {
      newErrors.transactionDate = 'Transaction date cannot be in the future';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    const transactionData: Omit<OptionTransaction, 'id'> = {
      accountId: formData.accountId,
      ticker: formData.ticker.toUpperCase(),
      strategy: formData.strategy as OptionStrategy,
      optionType: formData.optionType as 'call' | 'put',
      action: formData.action as OptionAction,
      contracts: parseFloat(formData.contracts),
      strikePrice: parseFloat(formData.strikePrice),
      premiumPerShare: parseFloat(formData.premiumPerShare),
      totalPremium: totalPremium,
      fees: parseFloat(formData.fees),
      expirationDate: formData.expirationDate,
      transactionDate: formData.transactionDate,
      status: formData.status as OptionStatus,
      collateralRequired: collateralRequired > 0 ? collateralRequired : undefined,
      collateralReleased: formData.status === 'closed' || formData.status === 'expired',
      notes: formData.notes,
      tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined
    };
    
    if (transaction) {
      onSave({ ...transactionData, id: transaction.id });
    } else {
      onSave(transactionData);
    }
  };
  
  const handleTagToggle = (tagId: string) => {
    const newTagIds = formData.tagIds.includes(tagId)
      ? formData.tagIds.filter(id => id !== tagId)
      : [...formData.tagIds, tagId];
    handleChange('tagIds', newTagIds);
  };
  
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Account */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Account *
          </label>
          <select
            value={formData.accountId}
            onChange={(e) => handleChange('accountId', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.accountId ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Select Account</option>
            {accounts.map(account => (
              <option key={account.id} value={account.id}>
                {account.name} (${account.currentCash.toFixed(2)})
              </option>
            ))}
          </select>
          {errors.accountId && (
            <p className="text-red-500 text-xs mt-1">{errors.accountId}</p>
          )}
        </div>
        
        {/* Strategy */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Strategy *
          </label>
          <select
            value={formData.strategy}
            onChange={(e) => handleChange('strategy', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="cash-secured-put">Cash-Secured Put</option>
            <option value="covered-call">Covered Call</option>
            <option value="long-call">Long Call</option>
            <option value="long-put">Long Put</option>
            <option value="credit-spread">Credit Spread</option>
            <option value="debit-spread">Debit Spread</option>
            <option value="iron-condor">Iron Condor</option>
            <option value="straddle">Straddle</option>
            <option value="strangle">Strangle</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        {/* Ticker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Underlying Ticker *
          </label>
          <input
            type="text"
            value={formData.ticker}
            onChange={(e) => handleChange('ticker', e.target.value.toUpperCase())}
            placeholder="e.g., AAPL"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.ticker ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.ticker && (
            <p className="text-red-500 text-xs mt-1">{errors.ticker}</p>
          )}
          {formData.strategy === 'covered-call' && availableShares > 0 && (
            <p className="text-gray-500 text-xs mt-1">
              Available: {availableShares} shares
            </p>
          )}
        </div>
        
        {/* Action */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Action *
          </label>
          <select
            value={formData.action}
            onChange={(e) => handleChange('action', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="sell-to-open">Sell to Open</option>
            <option value="buy-to-open">Buy to Open</option>
            <option value="buy-to-close">Buy to Close</option>
            <option value="sell-to-close">Sell to Close</option>
          </select>
        </div>
        
        {/* Contracts */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Contracts *
          </label>
          <input
            type="number"
            value={formData.contracts}
            onChange={(e) => handleChange('contracts', e.target.value)}
            placeholder="1"
            min="0"
            step="1"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.contracts ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.contracts && (
            <p className="text-red-500 text-xs mt-1">{errors.contracts}</p>
          )}
          <p className="text-gray-500 text-xs mt-1">
            = {requiredShares} shares
          </p>
        </div>
        
        {/* Strike Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Strike Price *
          </label>
          <input
            type="number"
            value={formData.strikePrice}
            onChange={(e) => handleChange('strikePrice', e.target.value)}
            placeholder="150.00"
            min="0"
            step="0.01"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.strikePrice ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.strikePrice && (
            <p className="text-red-500 text-xs mt-1">{errors.strikePrice}</p>
          )}
        </div>
        
        {/* Premium Per Share */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Premium Per Share *
          </label>
          <input
            type="number"
            value={formData.premiumPerShare}
            onChange={(e) => handleChange('premiumPerShare', e.target.value)}
            placeholder="3.50"
            min="0"
            step="0.01"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.premiumPerShare ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.premiumPerShare && (
            <p className="text-red-500 text-xs mt-1">{errors.premiumPerShare}</p>
          )}
        </div>
        
        {/* Fees */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Fees
          </label>
          <input
            type="number"
            value={formData.fees}
            onChange={(e) => handleChange('fees', e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Expiration Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expiration Date *
          </label>
          <input
            type="date"
            value={formData.expirationDate}
            onChange={(e) => handleChange('expirationDate', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.expirationDate ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.expirationDate && (
            <p className="text-red-500 text-xs mt-1">{errors.expirationDate}</p>
          )}
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setExpirationPreset(7)}
              className="text-xs text-blue-600 hover:underline"
            >
              +7d
            </button>
            <button
              type="button"
              onClick={() => setExpirationPreset(14)}
              className="text-xs text-blue-600 hover:underline"
            >
              +14d
            </button>
            <button
              type="button"
              onClick={() => setExpirationPreset(30)}
              className="text-xs text-blue-600 hover:underline"
            >
              +30d
            </button>
            <button
              type="button"
              onClick={() => setExpirationPreset(45)}
              className="text-xs text-blue-600 hover:underline"
            >
              +45d
            </button>
          </div>
          {daysToExpiration > 0 && (
            <p className="text-gray-500 text-xs mt-1">
              {daysToExpiration} days to expiration
            </p>
          )}
        </div>
        
        {/* Transaction Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Transaction Date *
          </label>
          <input
            type="date"
            value={formData.transactionDate}
            onChange={(e) => handleChange('transactionDate', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.transactionDate ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.transactionDate && (
            <p className="text-red-500 text-xs mt-1">{errors.transactionDate}</p>
          )}
        </div>
        
        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Status *
          </label>
          <select
            value={formData.status}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="open">Open</option>
            <option value="expired">Expired</option>
            <option value="assigned">Assigned</option>
            <option value="exercised">Exercised</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>
      
      {/* Calculations Display */}
      {showCalculations && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg space-y-2">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
              <Calculator className="w-4 h-4" />
              Calculations
            </h4>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-600">Total Premium</p>
              <p className="text-lg font-bold text-blue-600">
                ${totalPremium.toFixed(2)}
              </p>
            </div>
            {collateralRequired > 0 && (
              <div>
                <p className="text-xs text-gray-600">Collateral Required</p>
                <p className="text-lg font-bold text-orange-600">
                  ${collateralRequired.toFixed(2)}
                </p>
              </div>
            )}
            {annualizedReturn > 0 && (
              <div>
                <p className="text-xs text-gray-600">Annualized Return</p>
                <p className="text-lg font-bold text-green-600">
                  {annualizedReturn.toFixed(2)}%
                </p>
              </div>
            )}
            {collateralRequired > 0 && (
              <div>
                <p className="text-xs text-gray-600">Return on Collateral</p>
                <p className="text-lg font-bold text-purple-600">
                  {((totalPremium / collateralRequired) * 100).toFixed(2)}%
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* Tags */}
      {tags.filter(t => t.type === 'option' || t.type === 'both').length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <div className="flex flex-wrap gap-2">
            {tags
              .filter(t => t.type === 'option' || t.type === 'both')
              .map(tag => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => handleTagToggle(tag.id)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    formData.tagIds.includes(tag.id)
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  style={{
                    backgroundColor: formData.tagIds.includes(tag.id) ? tag.color : undefined
                  }}
                >
                  {tag.name}
                </button>
              ))}
          </div>
        </div>
      )}
      
      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes
        </label>
        <textarea
          value={formData.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          placeholder="Add any additional information..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>
      
      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          {transaction ? 'Update' : 'Add'} Option
        </button>
      </div>
    </form>
  );
};
