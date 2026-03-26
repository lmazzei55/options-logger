import React from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import type { InvestmentAccount } from '../../types';
import type { AccountInfo } from '../../utils/parsers/BrokerParser';
import { maskAccountNumber } from '../../utils/accountMatcher';

interface AccountMatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  accountInfo: AccountInfo;
  suggestions: InvestmentAccount[];
  onSelectAccount: (accountId: string) => void;
  onCreateNew: () => void;
}

const AccountMatchDialog: React.FC<AccountMatchDialogProps> = ({
  isOpen,
  onClose,
  accountInfo,
  suggestions,
  onSelectAccount,
  onCreateNew
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full border border-gray-800 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-800 sticky top-0 bg-gray-900">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-yellow-400" />
            <h2 className="text-xl font-semibold text-white">Select Account</h2>
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
            <h3 className="text-sm font-medium text-gray-300 mb-2">Statement Information:</h3>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Broker:</span>
              <span className="text-white font-medium">{accountInfo.broker}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Account Number:</span>
              <span className="text-white font-medium">{maskAccountNumber(accountInfo.accountNumber)}</span>
            </div>
          </div>

          {suggestions.length > 0 ? (
            <>
              <p className="text-sm text-gray-400">
                We found {suggestions.length} possible {suggestions.length === 1 ? 'match' : 'matches'} in your portfolio. Please select the correct account:
              </p>

              <div className="space-y-3">
                {suggestions.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => onSelectAccount(account.id)}
                    className="w-full p-4 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-blue-500 rounded-lg transition-all text-left group"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="text-white font-medium">{account.name}</h4>
                          {account.accountNumber === accountInfo.accountNumber && (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          )}
                        </div>
                        <div className="space-y-1 text-sm">
                          <div className="flex gap-4">
                            <span className="text-gray-400">Broker:</span>
                            <span className="text-gray-300">{account.broker}</span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-gray-400">Account:</span>
                            <span className="text-gray-300">{maskAccountNumber(account.accountNumber)}</span>
                          </div>
                          <div className="flex gap-4">
                            <span className="text-gray-400">Type:</span>
                            <span className="text-gray-300 capitalize">{account.type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-gray-500">
                          {account.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">
              No matching accounts found for {accountInfo.broker} {maskAccountNumber(accountInfo.accountNumber)}.
            </p>
          )}

          <div className="pt-4 border-t border-gray-800">
            <button
              onClick={onCreateNew}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Create New Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccountMatchDialog;
