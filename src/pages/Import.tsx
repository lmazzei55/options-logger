import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { getAvailableBrokers, getParser, type ParsedTransaction } from '../utils/parsers';
import { extractTextFromPDF } from '../utils/pdfExtractor';
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

const Import: React.FC = () => {
  const { accounts, addStockTransaction } = useAppContext();
  const navigate = useNavigate();
  
  const [selectedBroker, setSelectedBroker] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  
  const brokers = getAvailableBrokers();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setErrors([]);
      setWarnings([]);
      setParsedTransactions([]);
      setShowPreview(false);
    } else {
      setErrors(['Please select a valid PDF file']);
    }
  };
  
  const handleParse = async () => {
    if (!file || !selectedBroker) {
      setErrors(['Please select a broker and upload a PDF file']);
      return;
    }
    
    setIsProcessing(true);
    setErrors([]);
    setWarnings([]);
    
    try {
      // Extract text from PDF
      const pdfText = await extractTextFromPDF(file);
      
      // Get the appropriate parser
      const parser = getParser(selectedBroker);
      if (!parser) {
        setErrors(['Invalid broker selected']);
        setIsProcessing(false);
        return;
      }
      
      // Parse the PDF text
      const result = parser.parse(pdfText);
      
      if (result.success) {
        setParsedTransactions(result.transactions);
        setWarnings(result.warnings);
        setShowPreview(true);
      } else {
        setErrors(result.errors);
        setWarnings(result.warnings);
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
        importErrors.push(`Failed to import ${txn.ticker} transaction: ${error instanceof Error ? error.message : String(error)}`);
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
          {file && (
            <div className="mt-4 flex items-center justify-center gap-2 text-gray-300">
              <FileText className="w-5 h-5" />
              <span>{file.name}</span>
            </div>
          )}
        </div>
        
        <button
          onClick={handleParse}
          disabled={!file || !selectedBroker || isProcessing}
          className="mt-4 w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isProcessing ? 'Processing...' : 'Parse Statement'}
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
      {showPreview && parsedTransactions.length > 0 && (
        <div className="bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-white">Preview Transactions</h2>
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span>{parsedTransactions.length} transaction(s) found</span>
            </div>
          </div>
          
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
          
          <div className="flex gap-4 mt-6">
            <button
              onClick={handleImport}
              disabled={!selectedAccount}
              className="flex-1 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors font-medium"
            >
              Import {parsedTransactions.length} Transaction(s)
            </button>
            <button
              onClick={() => {
                setShowPreview(false);
                setParsedTransactions([]);
                setFile(null);
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
