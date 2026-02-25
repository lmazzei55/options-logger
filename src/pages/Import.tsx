import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { getAvailableBrokers, getParser, type ParsedTransaction, type ParsedOptionTransaction, type AccountInfo } from '../utils/parsers';
import { extractTextFromPDF } from '../utils/pdfExtractor';
import {
  validateStockTransaction,
  validateOptionTransaction,
  findDuplicateStockTransactions,
  findDuplicateOptionTransactions,
  type ValidationError
} from '../utils/validation';
import { Upload, FileText, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { matchAccount, type AccountMatchResult } from '../utils/accountMatcher';
import NewAccountDialog from '../components/modals/NewAccountDialog';
import AccountMatchDialog from '../components/modals/AccountMatchDialog';

const Import: React.FC = () => {
  const { accounts, stockTransactions, optionTransactions, addStockTransaction, addOptionTransaction, addAccount } = useAppContext();
  const navigate = useNavigate();
  
  const [selectedBroker, setSelectedBroker] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [processingProgress, setProcessingProgress] = useState(0);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [parsedOptionTransactions, setParsedOptionTransactions] = useState<ParsedOptionTransaction[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  
  // Account matching state
  const [detectedAccountInfo, setDetectedAccountInfo] = useState<AccountInfo | null>(null);
  const [accountMatchResult, setAccountMatchResult] = useState<AccountMatchResult | null>(null);
  const [showNewAccountDialog, setShowNewAccountDialog] = useState(false);
  const [showAccountMatchDialog, setShowAccountMatchDialog] = useState(false);
  const [autoMatchedAccount, setAutoMatchedAccount] = useState<string | null>(null);
  
  const brokers = getAvailableBrokers();
  
  // Validate transactions when account is selected (after dialogs)
  useEffect(() => {
    if (selectedAccount && parsedTransactions.length === 0 && parsedOptionTransactions.length === 0) {
      return; // No transactions to validate
    }
    
    if (!selectedAccount || (parsedTransactions.length === 0 && parsedOptionTransactions.length === 0)) {
      return; // Nothing to validate yet
    }
    
    // Run validation
    const allValidationErrors: ValidationError[] = [];
    let duplicates = 0;
    
    // Validate stock transactions
    parsedTransactions.forEach((txn, idx) => {
      const validation = validateStockTransaction({
        accountId: selectedAccount,
        date: txn.date,
        ticker: txn.ticker,
        action: txn.action,
        shares: txn.shares,
        pricePerShare: txn.pricePerShare,
        fees: txn.fees || 0,
        totalAmount: txn.shares * txn.pricePerShare + (txn.fees || 0),
        notes: txn.notes
      }, accounts);
      
      validation.errors.forEach(err => {
        allValidationErrors.push({ ...err, field: `Stock #${idx + 1} - ${err.field}` });
      });
      validation.warnings.forEach(warn => {
        allValidationErrors.push({ ...warn, field: `Stock #${idx + 1} - ${warn.field}` });
      });
      
      // Check for duplicates
      const dups = findDuplicateStockTransactions({
        accountId: selectedAccount,
        ticker: txn.ticker,
        action: txn.action,
        shares: txn.shares,
        pricePerShare: txn.pricePerShare,
        fees: txn.fees || 0,
        totalAmount: txn.shares * txn.pricePerShare + (txn.fees || 0),
        date: txn.date,
        notes: txn.notes
      }, stockTransactions);
      
      if (dups.length > 0) {
        duplicates++;
        allValidationErrors.push({
          field: `Stock #${idx + 1}`,
          message: `Duplicate transaction found (${txn.ticker} ${txn.action} on ${txn.date})`,
          severity: 'warning'
        });
      }
    });
    
    // Validate option transactions
    parsedOptionTransactions.forEach((txn, idx) => {
      const validation = validateOptionTransaction({
        accountId: selectedAccount,
        ticker: txn.ticker,
        strategy: 'other',
        optionType: txn.optionType,
        action: txn.action,
        contracts: txn.contracts,
        strikePrice: txn.strikePrice,
        premiumPerShare: txn.premiumPerShare,
        totalPremium: txn.contracts * txn.premiumPerShare * 100,
        fees: txn.fees || 0,
        expirationDate: txn.expirationDate,
        transactionDate: txn.date,
        status: 'open',
        notes: txn.notes
      }, accounts);
      
      validation.errors.forEach(err => {
        allValidationErrors.push({ ...err, field: `Option #${idx + 1} - ${err.field}` });
      });
      validation.warnings.forEach(warn => {
        allValidationErrors.push({ ...warn, field: `Option #${idx + 1} - ${warn.field}` });
      });
      
      // Check for duplicates
      const dups = findDuplicateOptionTransactions({
        accountId: selectedAccount,
        ticker: txn.ticker,
        strategy: 'other',
        optionType: txn.optionType,
        action: txn.action,
        contracts: txn.contracts,
        strikePrice: txn.strikePrice,
        premiumPerShare: txn.premiumPerShare,
        totalPremium: txn.contracts * txn.premiumPerShare * 100,
        fees: txn.fees || 0,
        expirationDate: txn.expirationDate,
        transactionDate: txn.date,
        status: 'open',
        notes: txn.notes
      }, optionTransactions);
      
      if (dups.length > 0) {
        duplicates++;
        allValidationErrors.push({
          field: `Option #${idx + 1}`,
          message: `Duplicate transaction found (${txn.ticker} ${txn.optionType} on ${txn.date})`,
          severity: 'warning'
        });
      }
    });
    
    setValidationErrors(allValidationErrors);
    setDuplicateCount(duplicates);
    setShowPreview(true);
  }, [selectedAccount, parsedTransactions, parsedOptionTransactions, accounts, stockTransactions, optionTransactions]);
  
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
    setLoadingMessage('Preparing to parse statements...');
    setProcessingProgress(0);
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
      let firstAccountInfo: AccountInfo | undefined;
      
      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const progress = Math.round(((i + 1) / files.length) * 100);
        setLoadingMessage(`Processing ${file.name} (${i + 1}/${files.length})...`);
        setProcessingProgress(progress);
        
        try {
          // Extract text from PDF
          const pdfText = await extractTextFromPDF(file);
          
          // Parse the PDF text
          const result = parser.parse(pdfText);
          
          if (result.success) {
            allTransactions.push(...result.transactions);
            allOptionTransactions.push(...result.optionTransactions);
            
            // Capture account info from first successful parse
            if (!firstAccountInfo && result.accountInfo) {
              firstAccountInfo = result.accountInfo;
            }
            
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
      
      // Try to match account automatically if account info was detected
      if (firstAccountInfo && !selectedAccount) {
        const matchResult = matchAccount(firstAccountInfo, accounts);
        setDetectedAccountInfo(firstAccountInfo);
        setAccountMatchResult(matchResult);
        
        if (matchResult.matched && matchResult.confidence === 'exact') {
          // Auto-select exact match
          setSelectedAccount(matchResult.account!.id);
          setAutoMatchedAccount(matchResult.account!.id);
          allWarnings.push(`Auto-matched to account: ${matchResult.account!.name}`);
        } else if (matchResult.matched && matchResult.confidence === 'partial') {
          // Auto-select single partial match
          setSelectedAccount(matchResult.account!.id);
          setAutoMatchedAccount(matchResult.account!.id);
          allWarnings.push(`Auto-matched to account: ${matchResult.account!.name} (partial match)`);
        } else if (matchResult.suggestions.length > 0) {
          // Show suggestions dialog
          setShowAccountMatchDialog(true);
        } else {
          // No match found - show create new account dialog
          setShowNewAccountDialog(true);
        }
      }
      
      // Only validate if we have a selected account (or will auto-select)
      // If dialogs will be shown, validation will happen after account selection
      const shouldValidateNow = selectedAccount || 
        (firstAccountInfo && matchResult && matchResult.matched && matchResult.confidence === 'exact') ||
        (firstAccountInfo && matchResult && matchResult.matched && matchResult.confidence === 'partial');
      
      // Validate and check for duplicates
      const allValidationErrors: ValidationError[] = [];
      let duplicates = 0;
      
      if (!shouldValidateNow) {
        // Skip validation for now - will validate after account is selected
        setParsedTransactions(allTransactions);
        setParsedOptionTransactions(allOptionTransactions);
        setErrors(allErrors);
        setWarnings(allWarnings);
        setIsProcessing(false);
        return;
      }

      // Validate stock transactions
      allTransactions.forEach((txn, idx) => {
        const validation = validateStockTransaction({
          accountId: selectedAccount || '',
          date: txn.date,
          ticker: txn.ticker,
          action: txn.action,
          shares: txn.shares,
          pricePerShare: txn.pricePerShare,
          fees: txn.fees || 0,
          totalAmount: txn.shares * txn.pricePerShare + (txn.fees || 0),
          notes: txn.notes
        }, accounts);

        validation.errors.forEach(err => {
          allValidationErrors.push({ ...err, field: `Stock #${idx + 1} - ${err.field}` });
        });
        validation.warnings.forEach(warn => {
          allValidationErrors.push({ ...warn, field: `Stock #${idx + 1} - ${warn.field}` });
        });

        // Check for duplicates
        const dups = findDuplicateStockTransactions({
          accountId: selectedAccount || '',
          date: txn.date,
          ticker: txn.ticker,
          action: txn.action,
          shares: txn.shares,
          pricePerShare: txn.pricePerShare,
          fees: txn.fees || 0,
          totalAmount: txn.shares * txn.pricePerShare + (txn.fees || 0),
          notes: txn.notes
        }, stockTransactions);

        if (dups.length > 0) {
          duplicates++;
          allValidationErrors.push({
            field: `Stock #${idx + 1}`,
            message: `Duplicate transaction found (${txn.ticker} on ${txn.date})`,
            severity: 'warning'
          });
        }
      });

      // Validate option transactions
      allOptionTransactions.forEach((txn, idx) => {
        const validation = validateOptionTransaction({
          accountId: selectedAccount || '',
          ticker: txn.ticker,
          strategy: 'other',
          optionType: txn.optionType,
          action: txn.action,
          contracts: txn.contracts,
          strikePrice: txn.strikePrice,
          premiumPerShare: txn.premiumPerShare,
          totalPremium: txn.contracts * txn.premiumPerShare * 100,
          fees: txn.fees || 0,
          expirationDate: txn.expirationDate,
          transactionDate: txn.date,
          status: 'open',
          notes: txn.notes
        }, accounts);

        validation.errors.forEach(err => {
          allValidationErrors.push({ ...err, field: `Option #${idx + 1} - ${err.field}` });
        });
        validation.warnings.forEach(warn => {
          allValidationErrors.push({ ...warn, field: `Option #${idx + 1} - ${warn.field}` });
        });

        // Check for duplicates
        const dups = findDuplicateOptionTransactions({
          accountId: selectedAccount || '',
          ticker: txn.ticker,
          strategy: 'other',
          optionType: txn.optionType,
          action: txn.action,
          contracts: txn.contracts,
          strikePrice: txn.strikePrice,
          premiumPerShare: txn.premiumPerShare,
          totalPremium: txn.contracts * txn.premiumPerShare * 100,
          fees: txn.fees || 0,
          expirationDate: txn.expirationDate,
          transactionDate: txn.date,
          status: 'open',
          notes: txn.notes
        }, optionTransactions);

        if (dups.length > 0) {
          duplicates++;
          allValidationErrors.push({
            field: `Option #${idx + 1}`,
            message: `Duplicate transaction found (${txn.ticker} ${txn.optionType} on ${txn.date})`,
            severity: 'warning'
          });
        }
      });

      setValidationErrors(allValidationErrors);
      setDuplicateCount(duplicates);
      
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
    
    // Check for validation errors
    const criticalErrors = validationErrors.filter(e => e.severity === 'error');
    if (criticalErrors.length > 0) {
      setErrors(['Cannot import: Please fix validation errors first']);
      return;
    }
    
    // Check for duplicate warnings
    const duplicateWarnings = validationErrors.filter(e => 
      e.severity === 'warning' && e.message.includes('Duplicate transaction')
    );
    if (duplicateWarnings.length > 0) {
      const confirmImport = window.confirm(
        `${duplicateWarnings.length} duplicate transaction(s) detected. These may have been imported previously.\n\nDo you want to import them anyway?`
      );
      if (!confirmImport) {
        return;
      }
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">Step 2: Select Account</h2>
          {autoMatchedAccount && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span className="text-green-400">Auto-matched</span>
            </div>
          )}
        </div>
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
        {detectedAccountInfo && selectedAccount && (
          <div className="mt-3 p-3 bg-gray-800 rounded-lg text-sm">
            <div className="text-gray-400 mb-1">Detected from statement:</div>
            <div className="text-white">
              {detectedAccountInfo.broker} - {detectedAccountInfo.accountNumber.slice(-4)}
            </div>
          </div>
        )}
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
        
        {/* Loading Indicator */}
        {isProcessing && (
          <div className="mt-4 space-y-2">
            <div className="text-sm text-gray-400">{loadingMessage}</div>
            <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div 
                className="bg-blue-600 h-full transition-all duration-300 ease-out"
                style={{ width: `${processingProgress}%` }}
              />
            </div>
            <div className="text-xs text-gray-500 text-right">{processingProgress}%</div>
          </div>
        )}
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
      
      {/* Validation Errors and Warnings */}
      {validationErrors.length > 0 && (
        <div className="bg-gray-900 rounded-lg shadow-lg p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">Validation Results</h3>
          
          {duplicateCount > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-yellow-300">
                    <strong>{duplicateCount}</strong> duplicate transaction(s) detected. These may have been imported previously.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {validationErrors.map((error, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 p-3 rounded-lg ${
                  error.severity === 'error'
                    ? 'bg-red-900/20 border border-red-800'
                    : 'bg-yellow-900/20 border border-yellow-800'
                }`}
              >
                {error.severity === 'error' ? (
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 text-sm">
                  <span className={error.severity === 'error' ? 'text-red-300' : 'text-yellow-300'}>
                    <strong>{error.field}:</strong> {error.message}
                  </span>
                </div>
              </div>
            ))}
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
                          ${(() => {
                            const premiumTotal = txn.contracts * txn.premiumPerShare * 100;
                            const fees = txn.fees || 0;
                            // For sell transactions, subtract fees from received amount
                            // For buy transactions, add fees to cost
                            const total = txn.action.includes('sell') ? premiumTotal - fees : premiumTotal + fees;
                            return total.toFixed(2);
                          })()}
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
      
      {/* Account Matching Dialogs */}
      {detectedAccountInfo && (
        <>
          <NewAccountDialog
            isOpen={showNewAccountDialog}
            onClose={() => setShowNewAccountDialog(false)}
            accountInfo={detectedAccountInfo}
            onCreateAccount={(newAccount) => {
              addAccount(newAccount);
              setSelectedAccount(newAccount.id);
              setShowNewAccountDialog(false);
            }}
            onSelectExisting={() => {
              setShowNewAccountDialog(false);
              setShowAccountMatchDialog(true);
            }}
          />
          
          <AccountMatchDialog
            isOpen={showAccountMatchDialog}
            onClose={() => setShowAccountMatchDialog(false)}
            accountInfo={detectedAccountInfo}
            suggestions={accountMatchResult?.suggestions || []}
            onSelectAccount={(accountId) => {
              setSelectedAccount(accountId);
              setShowAccountMatchDialog(false);
            }}
            onCreateNew={() => {
              setShowAccountMatchDialog(false);
              setShowNewAccountDialog(true);
            }}
          />
        </>
      )}
    </div>
  );
};

export default Import;
