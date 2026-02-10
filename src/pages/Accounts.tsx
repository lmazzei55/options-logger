import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { formatCurrency } from '../utils/calculations';
import { Plus } from 'lucide-react';

const Accounts: React.FC = () => {
  const { accounts } = useAppContext();
  const [showForm, setShowForm] = useState(false);
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Investment Accounts</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Account
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {accounts.map(account => (
          <div key={account.id} className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">{account.name}</h3>
                <p className="text-sm text-gray-600">{account.broker}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {account.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Type</span>
                <span className="text-sm font-medium text-gray-900 capitalize">{account.type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Current Cash</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(account.currentCash)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Initial Cash</span>
                <span className="text-sm font-medium text-gray-900">
                  {formatCurrency(account.initialCash)}
                </span>
              </div>
            </div>
            
            {account.notes && (
              <p className="text-sm text-gray-600 mt-4 pt-4 border-t border-gray-200">
                {account.notes}
              </p>
            )}
          </div>
        ))}
      </div>
      
      {accounts.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <p className="text-gray-500 text-lg">No accounts yet</p>
          <p className="text-gray-400 text-sm mt-2">Add your first investment account to get started</p>
        </div>
      )}
    </div>
  );
};

export default Accounts;
