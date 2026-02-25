import React, { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';
import type { AccountInfo } from '../../utils/parsers/BrokerParser';
import type { InvestmentAccount } from '../../types';
import { suggestAccountName, maskAccountNumber } from '../../utils/accountMatcher';
import { generateId } from '../../utils/calculations';

interface NewAccountDialogProps {
  isOpen: boolean;
  onClose: () => void;
  accountInfo: AccountInfo;
  onCreateAccount: (account: InvestmentAccount) => void;
  onSelectExisting: () => void;
}

const NewAccountDialog: React.FC<NewAccountDialogProps> = ({
  isOpen,
  onClose,
  accountInfo,
  onCreateAccount,
  onSelectExisting
}) => {
  const [accountName, setAccountName] = useState(suggestAccountName(accountInfo));
  const [accountType, setAccountType] = useState<'brokerage' | 'retirement' | 'margin' | 'cash' | 'other'>(
    accountInfo.accountType === 'crypto' ? 'other' : (accountInfo.accountType || 'brokerage')
  );
  const [initialCash, setInitialCash] = useState('0');

  if (!isOpen) return null;

  const handleCreate = () => {
    const newAccount: InvestmentAccount = {
      id: generateId(),
      name: accountName,
      type: accountType,
      broker: accountInfo.broker,
      accountNumber: accountInfo.accountNumber,
      initialCash: parseFloat(initialCash) || 0,
      currentCash: parseFloat(initialCash) || 0,
      currency: 'USD',
      isActive: true,
      createdDate: new Date().toISOString().split('T')[0],
      notes: `Auto-created from ${accountInfo.broker} statement import`
    };

    onCreateAccount(newAccount);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-xl max-w-md w-full border border-gray-800">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-blue-400" />
            <h2 className="text-xl font-semibold text-white">New Account Detected</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Broker:</span>
              <span className="text-white font-medium">{accountInfo.broker}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Account Number:</span>
              <span className="text-white font-medium">{maskAccountNumber(accountInfo.accountNumber)}</span>
            </div>
            {accountInfo.accountName && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Type:</span>
                <span className="text-white font-medium">{accountInfo.accountName}</span>
              </div>
            )}
          </div>

          <p className="text-sm text-gray-400">
            This account doesn't exist in your portfolio yet. Would you like to create it?
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Account Name
              </label>
              <input
                type="text"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Fidelity Brokerage"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Account Type
              </label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as any)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="brokerage">Brokerage</option>
                <option value="retirement">Retirement (IRA/401k)</option>
                <option value="margin">Margin</option>
                <option value="cash">Cash</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Initial Cash Balance (Optional)
              </label>
              <input
                type="number"
                value={initialCash}
                onChange={(e) => setInitialCash(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00"
                step="0.01"
              />
              <p className="text-xs text-gray-500 mt-1">
                You can update this later in account settings
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 p-6 border-t border-gray-800">
          <button
            onClick={onSelectExisting}
            className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Select Existing Account
          </button>
          <button
            onClick={handleCreate}
            disabled={!accountName.trim()}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Create Account
          </button>
        </div>
      </div>
    </div>
  );
};

export default NewAccountDialog;
