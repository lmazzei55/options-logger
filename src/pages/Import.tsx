import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { getAvailableBrokers, getParser, type ParsedTransaction, type ParsedOptionTransaction } from '../utils/parsers';
import { extractTextFromPDF } from '../utils/pdfExtractor';
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const Import: React.FC = () => {
  const { accounts, addStockTransaction, addOptionTransaction } = useAppContext();
  const navigate = useNavigate();
  
  const [selectedBroker, setSelectedBroker] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [parsedOptionTransactions, setParsedOptionTransactions] = useState<ParsedOptionTransaction[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  
  const brokers = getAvailableBrokers();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const pdfFiles = selectedFiles.filter(f => f.type === 'application/pdf');
    
    if (pdfFiles.length === 0) {
      setErrors(['Please select at least one valid PDF file']);
      return;
    }
    
    if (pdfFiles.length !== selectedFiles.length) {
      setWarnings([`Skipped ${selectedFiles.length - pdfFiles.length} non-PDF file(s)`]);
    }
    
    setFiles(pdfFiles);
    setErrors([]);
    setParsedTransactions([]);
    setParsedOptionTransactions([]);
    setShowPreview(false);
  };
  
  const handleParse = async () => {
    if (files.length === 0 || !selectedBroker) {
      setErrors(['Please select a broker and upload at least one PDF file']);
      return;
    }
    
    setIsProcessing(true);
    setErrors([]);
    setWarnings([]);
    
    try {
      // Get the appropriate parser
      const parser = getParser(selectedBroker);
      if (!parser) {
        setErrors(['Invalid broker selected']);
        setIsProcessing(false);
        return;
      }
      
      const allTransactions: ParsedTransaction[] = [];
      const allOptionTransactions: ParsedOptionTransaction[] = [];
      const allErrors: string[] = [];
      const allWarnings: string[] = [];
      
      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // Extract text from PDF
          const pdfText = await extractTextFromPDF(file);
          
          // Parse the PDF text
          const result = parser.parse(pdfText);
          
          if (result.success) {
            allTransactions.push(...result.transactions);
            allOptionTransactions.push(...result.optionTransactions);
            if (result.warnings.length > 0) {
              allWarnings.push(`${file.name}: ${result.warnings.join(', ')}`);
            }
          } else {
            allErrors.push(`${file.name}: ${result.errors.join(', ')}`);
            if (result.warnings.length > 0) {
              allWarnings.push(`${file.name}: ${result.warnings.join(', ')}`);
            }
          }
        } catch (error) {
          allErrors.push(`${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      // Sort transactions by date (oldest first)
      allTransactions.sort((a, b) => a.date.localeCompare(b.date));
      allOptionTransactions.sort((a, b) => a.date.localeCompare(b.date));
      
      console.log('=== PARSED TRANSACTIONS ===');
      console.log('Stock transactions:', allTransactions.length);
      console.log('Option transactions:', allOptionTransactions.length);
      allOptionTransactions.forEach((t, idx) => {
        console.log(`  ${idx + 1}. ${t.date} ${t.ticker} ${t.optionType} $${t.strikePrice} ${t.action} (${t.contracts} contracts)`);
      });
      
      setParsedTransactions(allTransactions);
      setParsedOptionTransactions(allOptionTransactions);
      setErrors(allErrors);
      setWarnings(allWarnings);
      
      if (allTransactions.length > 0 || allOptionTransactions.length > 0) {
        setShowPreview(true);
      }
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'An unknown error occurred']);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const handleImport = () => {
    if (!selectedAccount) {
      setErrors(['Please select an account to import transactions to']);
      return;
    }
    
    let importedCount = 0;
    const importErrors: string[] = [];
    
    // Import stock transactions
    for (const txn of parsedTransactions) {
      try {
        const totalAmount = txn.shares * txn.pricePerShare + (txn.fees || 0);
        addStockTransaction({
          accountId: selectedAccount,
          date: txn.date,
          ticker: txn.ticker,
          action: txn.action,
          shares: txn.shares,
          pricePerShare: txn.pricePerShare,
          fees: txn.fees || 0,
          totalAmount,
          notes: txn.notes || `Imported from ${brokers.find(b => b.id === selectedBroker)?.name}`
        });
        importedCount++;
      } catch (error) {
        importErrors.push(`Failed to import ${txn.ticker} stock transaction: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Import options transactions
    for (const txn of parsedOptionTransactions) {
      try {
        const totalPremium = txn.contracts * txn.premiumPerShare * 100; // 100 shares per contract
        addOptionTransaction({
          accountId: selectedAccount,
          ticker: txn.ticker,
          strategy: 'other', // Default strategy, user can update later
          optionType: txn.optionType,
          action: txn.action,
          contracts: txn.contracts,
          strikePrice: txn.strikePrice,
          premiumPerShare: txn.premiumPerShare,
          totalPremium,
          fees: txn.fees || 0,
          expirationDate: txn.expirationDate,
          transactionDate: txn.date,
          status: 'open', // Default to open, will be updated by position tracking
          notes: txn.notes || `Imported from ${brokers.find(b => b.id === selectedBroker)?.name}`
        });
        importedCount++;
      } catch (error) {
        importErrors.push(`Failed to import ${txn.ticker} option transaction: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    if (importErrors.length > 0) {
      setErrors(importErrors);
    } else {
      // Success - navigate to transactions page
      alert(`Successfully imported ${importedCount} transaction(s)`);
      navigate('/transactions');
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Import Transactions</h1>
        <p className="text-gray-400">Upload brokerage statements to automatically import transactions</p>
      </div>
      
      {/* Broker Selection */}
      <div className="bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Step 1: Select Broker</h2>
        <select
          value={selectedBroker}
          onChange={(e) => setSelectedBroker(e.target.value)}
          className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choose a broker...</option>
          {brokers.map(broker => (
            <option key={broker.id} value={broker.id}>{broker.name}</option>
          ))}
        </select>
      </div>
      
      {/* Account Selection */}
      <div className="bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Step 2: Select Account</h2>
        <select
          value={selectedAccount}
          onChange={(e) => setSelectedAccount(e.target.value)}
          className="w-full px-4 py-2 rounded-md border border-gray-600 bg-gray-800 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Choose an account...</option>
          {accounts.map(account => (
            <option key={account.id} value={account.id}>{account.name}</option>
          ))}
        </select>
      </div>
      
      {/* File Upload */}
      <div className="bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800">
        <h2 className="text-xl font-semibold text-white mb-4">Step 3: Upload Statement</h2>
        <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
          <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <input
            type="file"
            accept=".pdf"
            multiple
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="cursor-pointer text-blue-400 hover:text-blue-300"
          >
            Click to upload PDF statement
          </label>
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              <div className="text-gray-300 font-medium">
                {files.length} file(s) selected
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {files.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 text-gray-400 text-sm">
                    <FileText className="w-4 h-4" />
                    <span>{file.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        
        <button
          onClick={handleParse}
          disabled={files.length === 0 || !selectedBroker || isProcessing}
          className="mt-4 w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isProcessing ? `Processing ${files.length} file(s)...` : `Parse ${files.length > 0 ? files.length : ''} Statement${files.length !== 1 ? 's' : ''}`}
        </button>
      </div>
      
      {/* Errors */}
      {errors.length > 0 && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold mb-2">Errors</h3>
              <ul className="list-disc list-inside text-red-300 space-y-1">
                {errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-yellow-400 font-semibold mb-2">Warnings</h3>
              <ul className="list-disc list-inside text-yellow-300 space-y-1">
                {warnings.map((warning, i) => (
                  <li key={i}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
      
      {/* Preview */}
      {showPreview && (parsedTransactions.length > 0 || parsedOptionTransactions.length > 0) && (
        <div className="bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Preview Transactions</h2>
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span>{parsedTransactions.length + parsedOptionTransactions.length} transaction(s) found</span>
            </div>
          </div>
          
          {/* Stock Transactions */}
          {parsedTransactions.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Stock Transactions ({parsedTransactions.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Ticker</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Action</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Shares</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Price</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedTransactions.map((txn, i) => (
                  <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="py-3 px-4 text-gray-300">{txn.date}</td>
                    <td className="py-3 px-4 text-white font-medium">{txn.ticker}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        txn.action === 'buy' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                      }`}>
                        {txn.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-gray-300">{txn.shares.toFixed(5)}</td>
                    <td className="py-3 px-4 text-right text-gray-300">${txn.pricePerShare.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-white font-medium">
                      ${(txn.shares * txn.pricePerShare).toFixed(2)}
                    </td>
                  </tr>
                     ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {/* Options Transactions */}
          {parsedOptionTransactions.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-white mb-3">Options Transactions ({parsedOptionTransactions.length})</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Date</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Ticker</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Type</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Action</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Strike</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Contracts</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Premium</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Fees</th>
                      <th className="text-right py-3 px-4 text-gray-400 font-medium">Total</th>
                      <th className="text-left py-3 px-4 text-gray-400 font-medium">Expiration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedOptionTransactions.map((txn, i) => (
                      <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="py-3 px-4 text-gray-300">{txn.date}</td>
                        <td className="py-3 px-4 text-white font-medium">{txn.ticker}</td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            txn.optionType === 'call' ? 'bg-blue-900/30 text-blue-400' : 'bg-purple-900/30 text-purple-400'
                          }`}>
                            {txn.optionType.toUpperCase()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            txn.action.includes('open') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
                          }`}>
                            {txn.action.toUpperCase().replace(/-/g, ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-300">${txn.strikePrice.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{txn.contracts}</td>
                        <td className="py-3 px-4 text-right text-gray-300">${txn.premiumPerShare.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-gray-300">${(txn.fees || 0).toFixed(2)}</td>
                        <td className="py-3 px-4 text-right text-white font-medium">
                          ${(txn.contracts * txn.premiumPerShare * 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-gray-300">{txn.expirationDate}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          <div className="flex gap-4 mt-6">
            <button
              onClick={handleImport}
              disabled={!selectedAccount}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Import {parsedTransactions.length + parsedOptionTransactions.length} Transaction(s)
            </button>
            <button
              onClick={() => {
                setShowPreview(false);
                setParsedTransactions([]);
                setParsedOptionTransactions([]);
                setFiles([]);
              }}
              className="px-6 py-3 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Import;
