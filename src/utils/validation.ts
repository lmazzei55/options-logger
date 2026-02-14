import type { StockTransaction, OptionTransaction, InvestmentAccount } from '../types';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

// Validate stock transaction
export const validateStockTransaction = (
  transaction: Omit<StockTransaction, 'id'>,
  accounts: InvestmentAccount[]
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check account exists
  if (!accounts.find(a => a.id === transaction.accountId)) {
    errors.push({
      field: 'accountId',
      message: 'Account does not exist',
      severity: 'error'
    });
  }

  // Validate ticker format
  if (!transaction.ticker || !/^[A-Z]{1,5}$/.test(transaction.ticker)) {
    errors.push({
      field: 'ticker',
      message: 'Invalid ticker format (must be 1-5 uppercase letters)',
      severity: 'error'
    });
  }

  // Validate shares
  if (transaction.shares <= 0) {
    errors.push({
      field: 'shares',
      message: 'Shares must be greater than 0',
      severity: 'error'
    });
  }

  // Validate price
  if (transaction.pricePerShare < 0) {
    errors.push({
      field: 'pricePerShare',
      message: 'Price per share cannot be negative',
      severity: 'error'
    });
  }

  // Validate total amount
  if (transaction.totalAmount < 0) {
    errors.push({
      field: 'totalAmount',
      message: 'Total amount cannot be negative',
      severity: 'error'
    });
  }

  // Validate fees
  if (transaction.fees < 0) {
    errors.push({
      field: 'fees',
      message: 'Fees cannot be negative',
      severity: 'error'
    });
  }

  // Validate date
  const transactionDate = new Date(transaction.date);
  const now = new Date();
  if (isNaN(transactionDate.getTime())) {
    errors.push({
      field: 'date',
      message: 'Invalid date format',
      severity: 'error'
    });
  } else if (transactionDate > now) {
    warnings.push({
      field: 'date',
      message: 'Transaction date is in the future',
      severity: 'warning'
    });
  }

  // Validate split ratio format if present
  if (transaction.action === 'split' && transaction.splitRatio) {
    if (!/^\d+:\d+$/.test(transaction.splitRatio)) {
      errors.push({
        field: 'splitRatio',
        message: 'Split ratio must be in format "new:old" (e.g., "2:1")',
        severity: 'error'
      });
    }
  }

  // Check for reasonable price ranges (warning only)
  if (transaction.pricePerShare > 10000) {
    warnings.push({
      field: 'pricePerShare',
      message: 'Price per share is unusually high (>$10,000)',
      severity: 'warning'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

// Validate option transaction
export const validateOptionTransaction = (
  transaction: Omit<OptionTransaction, 'id'>,
  accounts: InvestmentAccount[]
): ValidationResult => {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check account exists
  if (!accounts.find(a => a.id === transaction.accountId)) {
    errors.push({
      field: 'accountId',
      message: 'Account does not exist',
      severity: 'error'
    });
  }

  // Validate ticker format
  if (!transaction.ticker || !/^[A-Z]{1,5}$/.test(transaction.ticker)) {
    errors.push({
      field: 'ticker',
      message: 'Invalid ticker format (must be 1-5 uppercase letters)',
      severity: 'error'
    });
  }

  // Validate contracts
  if (transaction.contracts <= 0) {
    errors.push({
      field: 'contracts',
      message: 'Contracts must be greater than 0',
      severity: 'error'
    });
  }

  // Validate strike price
  if (transaction.strikePrice <= 0) {
    errors.push({
      field: 'strikePrice',
      message: 'Strike price must be greater than 0',
      severity: 'error'
    });
  }

  // Validate premium
  if (transaction.premiumPerShare < 0) {
    errors.push({
      field: 'premiumPerShare',
      message: 'Premium per share cannot be negative',
      severity: 'error'
    });
  }

  // Validate total premium
  if (transaction.totalPremium < 0) {
    errors.push({
      field: 'totalPremium',
      message: 'Total premium cannot be negative',
      severity: 'error'
    });
  }

  // Validate fees
  if (transaction.fees < 0) {
    errors.push({
      field: 'fees',
      message: 'Fees cannot be negative',
      severity: 'error'
    });
  }

  // Validate transaction date
  const transactionDate = new Date(transaction.transactionDate);
  const now = new Date();
  if (isNaN(transactionDate.getTime())) {
    errors.push({
      field: 'transactionDate',
      message: 'Invalid transaction date format',
      severity: 'error'
    });
  } else if (transactionDate > now) {
    warnings.push({
      field: 'transactionDate',
      message: 'Transaction date is in the future',
      severity: 'warning'
    });
  }

  // Validate expiration date
  const expirationDate = new Date(transaction.expirationDate);
  if (isNaN(expirationDate.getTime())) {
    errors.push({
      field: 'expirationDate',
      message: 'Invalid expiration date format',
      severity: 'error'
    });
  } else {
    // Expiration should be after transaction date
    if (expirationDate < transactionDate) {
      errors.push({
        field: 'expirationDate',
        message: 'Expiration date cannot be before transaction date',
        severity: 'error'
      });
    }

    // Warn if expiration is more than 2 years out
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(twoYearsFromNow.getFullYear() + 2);
    if (expirationDate > twoYearsFromNow) {
      warnings.push({
        field: 'expirationDate',
        message: 'Expiration date is more than 2 years in the future',
        severity: 'warning'
      });
    }
  }

  // Check for reasonable strike price ranges (warning only)
  if (transaction.strikePrice > 10000) {
    warnings.push({
      field: 'strikePrice',
      message: 'Strike price is unusually high (>$10,000)',
      severity: 'warning'
    });
  }

  // Check for reasonable premium ranges (warning only)
  if (transaction.premiumPerShare > transaction.strikePrice) {
    warnings.push({
      field: 'premiumPerShare',
      message: 'Premium is higher than strike price (unusual)',
      severity: 'warning'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
};

// Generate transaction fingerprint for deduplication
export const generateStockTransactionFingerprint = (
  transaction: Omit<StockTransaction, 'id'>
): string => {
  return `${transaction.accountId}|${transaction.ticker}|${transaction.action}|${transaction.date}|${transaction.shares}|${transaction.pricePerShare}|${transaction.totalAmount}`;
};

export const generateOptionTransactionFingerprint = (
  transaction: Omit<OptionTransaction, 'id'>
): string => {
  return `${transaction.accountId}|${transaction.ticker}|${transaction.optionType}|${transaction.action}|${transaction.transactionDate}|${transaction.contracts}|${transaction.strikePrice}|${transaction.expirationDate}|${transaction.premiumPerShare}`;
};

// Check for duplicate transactions
export const findDuplicateStockTransactions = (
  newTransaction: Omit<StockTransaction, 'id'>,
  existingTransactions: StockTransaction[]
): StockTransaction[] => {
  const newFingerprint = generateStockTransactionFingerprint(newTransaction);
  
  return existingTransactions.filter(existing => {
    const existingFingerprint = generateStockTransactionFingerprint(existing);
    return existingFingerprint === newFingerprint;
  });
};

export const findDuplicateOptionTransactions = (
  newTransaction: Omit<OptionTransaction, 'id'>,
  existingTransactions: OptionTransaction[]
): OptionTransaction[] => {
  const newFingerprint = generateOptionTransactionFingerprint(newTransaction);
  
  return existingTransactions.filter(existing => {
    const existingFingerprint = generateOptionTransactionFingerprint(existing);
    return existingFingerprint === newFingerprint;
  });
};
