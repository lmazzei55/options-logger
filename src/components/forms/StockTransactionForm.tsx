import React, { useState } from 'react';
import type { StockTransaction } from '../../types';
import { useAppContext } from '../../context/AppContext';
// import { X } from 'lucide-react';

interface StockTransactionFormProps {
  transaction?: StockTransaction;
  onSave: (transaction: Omit<StockTransaction, 'id'> | StockTransaction) => void;
  onCancel: () => void;
}

export const StockTransactionForm: React.FC<StockTransactionFormProps> = ({
  transaction,
  onSave,
  onCancel
}) => {
  const { accounts, stockPositions, tags } = useAppContext();
  
  const [formData, setFormData] = useState({
    accountId: transaction?.accountId || accounts[0]?.id || '',
    ticker: transaction?.ticker || '',
    companyName: transaction?.companyName || '',
    action: transaction?.action || 'buy',
    shares: transaction?.shares.toString() || '',
    pricePerShare: transaction?.pricePerShare.toString() || '',
    fees: transaction?.fees.toString() || '0',
    date: transaction?.date || new Date().toISOString().split('T')[0],
    notes: transaction?.notes || '',
    tagIds: transaction?.tagIds || []
  });
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  
  // Calculate total amount
  const totalAmount = formData.shares && formData.pricePerShare
    ? parseFloat(formData.shares) * parseFloat(formData.pricePerShare) + parseFloat(formData.fees || '0')
    : 0;
  
  // Get available shares for selling
  const availableShares = formData.ticker && formData.accountId
    ? stockPositions.find(p => p.ticker === formData.ticker && p.accountId === formData.accountId)?.shares || 0
    : 0;
  
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
  
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!formData.accountId) newErrors.accountId = 'Account is required';
    if (!formData.ticker) newErrors.ticker = 'Ticker is required';
    if (!formData.shares || parseFloat(formData.shares) <= 0) {
      newErrors.shares = 'Shares must be greater than 0';
    }
    if (!formData.pricePerShare || parseFloat(formData.pricePerShare) <= 0) {
      newErrors.pricePerShare = 'Price must be greater than 0';
    }
    if (!formData.date) newErrors.date = 'Date is required';
    
    // Validate selling more shares than owned
    if (formData.action === 'sell' && parseFloat(formData.shares) > availableShares) {
      newErrors.shares = `Cannot sell more than ${availableShares} shares owned`;
    }
    
    // Validate date not in future
    if (new Date(formData.date) > new Date()) {
      newErrors.date = 'Date cannot be in the future';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validate()) return;
    
    const transactionData: Omit<StockTransaction, 'id'> = {
      accountId: formData.accountId,
      ticker: formData.ticker.toUpperCase(),
      companyName: formData.companyName,
      action: formData.action as any,
      shares: parseFloat(formData.shares),
      pricePerShare: parseFloat(formData.pricePerShare),
      totalAmount: totalAmount,
      fees: parseFloat(formData.fees),
      date: formData.date,
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
                {account.name}
              </option>
            ))}
          </select>
          {errors.accountId && (
            <p className="text-red-500 text-xs mt-1">{errors.accountId}</p>
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
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
            <option value="dividend">Dividend</option>
            <option value="split">Stock Split</option>
            <option value="transfer-in">Transfer In</option>
            <option value="transfer-out">Transfer Out</option>
          </select>
        </div>
        
        {/* Ticker */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Ticker Symbol *
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
          {formData.action === 'sell' && availableShares > 0 && (
            <p className="text-gray-500 text-xs mt-1">
              Available: {availableShares} shares
            </p>
          )}
        </div>
        
        {/* Company Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Company Name
          </label>
          <input
            type="text"
            value={formData.companyName}
            onChange={(e) => handleChange('companyName', e.target.value)}
            placeholder="e.g., Apple Inc."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        {/* Shares */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Number of Shares *
          </label>
          <input
            type="number"
            value={formData.shares}
            onChange={(e) => handleChange('shares', e.target.value)}
            placeholder="100"
            min="0"
            step="1"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.shares ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.shares && (
            <p className="text-red-500 text-xs mt-1">{errors.shares}</p>
          )}
        </div>
        
        {/* Price Per Share */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Price Per Share *
          </label>
          <input
            type="number"
            value={formData.pricePerShare}
            onChange={(e) => handleChange('pricePerShare', e.target.value)}
            placeholder="150.00"
            min="0"
            step="0.01"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.pricePerShare ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.pricePerShare && (
            <p className="text-red-500 text-xs mt-1">{errors.pricePerShare}</p>
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
        
        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date *
          </label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => handleChange('date', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.date ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.date && (
            <p className="text-red-500 text-xs mt-1">{errors.date}</p>
          )}
        </div>
      </div>
      
      {/* Total Amount Display */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total Amount:</span>
          <span className="text-lg font-bold text-blue-600">
            ${totalAmount.toFixed(2)}
          </span>
        </div>
      </div>
      
      {/* Tags */}
      {tags.filter(t => t.type === 'stock' || t.type === 'both').length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tags
          </label>
          <div className="flex flex-wrap gap-2">
            {tags
              .filter(t => t.type === 'stock' || t.type === 'both')
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
          {transaction ? 'Update' : 'Add'} Transaction
        </button>
      </div>
    </form>
  );
};
