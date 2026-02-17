/**
 * Input Sanitization Utilities
 * 
 * Provides functions to sanitize user inputs to prevent XSS attacks
 * and ensure data integrity.
 */

/**
 * Sanitizes a string by removing potentially dangerous characters
 * and HTML tags
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .substring(0, 1000); // Limit length
}

/**
 * Sanitizes a ticker symbol (uppercase letters only, 1-5 chars)
 */
export function sanitizeTicker(ticker: string): string {
  if (!ticker) return '';
  
  return ticker
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .substring(0, 5);
}

/**
 * Sanitizes a numeric input, ensuring it's a valid number
 */
export function sanitizeNumber(input: string | number): number {
  if (typeof input === 'number') {
    return isFinite(input) ? input : 0;
  }
  
  const cleaned = input.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  
  return isFinite(num) ? num : 0;
}

/**
 * Sanitizes a date string to ISO format (YYYY-MM-DD)
 */
export function sanitizeDate(date: string): string {
  if (!date) return '';
  
  // Remove any non-date characters
  const cleaned = date.replace(/[^0-9-]/g, '');
  
  // Validate format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(cleaned)) {
    return '';
  }
  
  // Validate it's a real date
  const d = new Date(cleaned + 'T00:00:00');
  if (isNaN(d.getTime())) {
    return '';
  }
  
  // Check if the date components match (catches invalid dates like 2026-02-30)
  const [year, month, day] = cleaned.split('-').map(Number);
  if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) {
    return '';
  }
  
  return cleaned;
}

/**
 * Sanitizes an option action to ensure it's valid
 */
export function sanitizeOptionAction(action: string): string {
  const validActions = ['buy-to-open', 'sell-to-open', 'buy-to-close', 'sell-to-close'];
  const cleaned = action.toLowerCase().trim();
  
  return validActions.includes(cleaned) ? cleaned : '';
}

/**
 * Sanitizes an option type to ensure it's valid
 */
export function sanitizeOptionType(type: string): 'call' | 'put' | '' {
  const cleaned = type.toLowerCase().trim();
  
  if (cleaned === 'call' || cleaned === 'c') return 'call';
  if (cleaned === 'put' || cleaned === 'p') return 'put';
  
  return '';
}

/**
 * Sanitizes account name
 */
export function sanitizeAccountName(name: string): string {
  if (!name) return '';
  
  return name
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 100);
}

/**
 * Sanitizes notes/description field
 */
export function sanitizeNotes(notes: string): string {
  if (!notes) return '';
  
  return notes
    .trim()
    .replace(/[<>]/g, '')
    .substring(0, 500);
}

/**
 * Validates and sanitizes a complete transaction object
 */
export function sanitizeTransaction(transaction: any): any {
  return {
    ...transaction,
    ticker: sanitizeTicker(transaction.ticker || ''),
    date: sanitizeDate(transaction.date || ''),
    shares: sanitizeNumber(transaction.shares || 0),
    pricePerShare: sanitizeNumber(transaction.pricePerShare || 0),
    fees: sanitizeNumber(transaction.fees || 0),
    notes: sanitizeNotes(transaction.notes || ''),
  };
}

/**
 * Validates and sanitizes a complete option transaction object
 */
export function sanitizeOptionTransaction(transaction: any): any {
  return {
    ...transaction,
    ticker: sanitizeTicker(transaction.ticker || ''),
    date: sanitizeDate(transaction.date || ''),
    action: sanitizeOptionAction(transaction.action || ''),
    optionType: sanitizeOptionType(transaction.optionType || ''),
    strike: sanitizeNumber(transaction.strike || 0),
    contracts: sanitizeNumber(transaction.contracts || 0),
    premium: sanitizeNumber(transaction.premium || 0),
    fees: sanitizeNumber(transaction.fees || 0),
    expiration: sanitizeDate(transaction.expiration || ''),
    notes: sanitizeNotes(transaction.notes || ''),
  };
}
