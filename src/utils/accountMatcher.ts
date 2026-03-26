import type { InvestmentAccount } from '../types';
import type { AccountInfo } from './parsers/BrokerParser';

export interface AccountMatchResult {
  matched: boolean;
  account?: InvestmentAccount;
  confidence: 'exact' | 'partial' | 'none';
  suggestions: InvestmentAccount[];  // Similar accounts for user review
}

/**
 * Normalize account number for comparison
 * Removes spaces, dashes, and converts to lowercase
 */
function normalizeAccountNumber(accountNumber: string | undefined): string {
  if (!accountNumber) return '';
  return accountNumber.replace(/[\s-]/g, '').toLowerCase();
}

/**
 * Normalize broker name for comparison
 * Converts to lowercase and removes common variations
 */
function normalizeBrokerName(broker: string): string {
  return broker.toLowerCase().trim();
}

/**
 * Extract last 4 digits from account number
 */
function getLast4Digits(accountNumber: string | undefined): string {
  if (!accountNumber) return '0000';
  const normalized = normalizeAccountNumber(accountNumber);
  return normalized.slice(-4);
}

/**
 * Match account information from parsed statement with existing accounts
 * 
 * Matching strategy:
 * 1. Exact match: Full account number + broker name
 * 2. Partial match: Last 4 digits + broker name
 * 3. No match: Return suggestions based on broker
 */
export function matchAccount(
  accountInfo: AccountInfo,
  existingAccounts: InvestmentAccount[]
): AccountMatchResult {
  if (!accountInfo || !accountInfo.accountNumber || !accountInfo.broker) {
    return {
      matched: false,
      confidence: 'none',
      suggestions: []
    };
  }

  const normalizedAccountNumber = normalizeAccountNumber(accountInfo.accountNumber);
  const normalizedBroker = normalizeBrokerName(accountInfo.broker);
  const last4 = getLast4Digits(accountInfo.accountNumber);

  // Try exact match first
  for (const account of existingAccounts) {
    const accountNormalized = normalizeAccountNumber(account.accountNumber);
    const brokerNormalized = normalizeBrokerName(account.broker);

    if (accountNormalized === normalizedAccountNumber && brokerNormalized === normalizedBroker) {
      return {
        matched: true,
        account,
        confidence: 'exact',
        suggestions: []
      };
    }
  }

  // Try partial match (last 4 digits + broker)
  const partialMatches: InvestmentAccount[] = [];
  for (const account of existingAccounts) {
    const accountLast4 = getLast4Digits(account.accountNumber);
    const brokerNormalized = normalizeBrokerName(account.broker);

    if (accountLast4 === last4 && brokerNormalized === normalizedBroker) {
      partialMatches.push(account);
    }
  }

  if (partialMatches.length === 1) {
    // Single partial match - high confidence
    return {
      matched: true,
      account: partialMatches[0],
      confidence: 'partial',
      suggestions: []
    };
  } else if (partialMatches.length > 1) {
    // Multiple partial matches - show suggestions
    return {
      matched: false,
      confidence: 'partial',
      suggestions: partialMatches
    };
  }

  // No match - suggest accounts from same broker
  const brokerSuggestions = existingAccounts.filter(account => 
    normalizeBrokerName(account.broker) === normalizedBroker
  );

  return {
    matched: false,
    confidence: 'none',
    suggestions: brokerSuggestions
  };
}

/**
 * Create a suggested account name based on account info
 */
export function suggestAccountName(accountInfo: AccountInfo): string {
  if (accountInfo.accountName) {
    return accountInfo.accountName;
  }

  const type = accountInfo.accountType || 'Account';
  const last4 = getLast4Digits(accountInfo.accountNumber);
  return `${accountInfo.broker} ${type} ****${last4}`;
}

/**
 * Mask account number for display (show last 4 digits only)
 */
export function maskAccountNumber(accountNumber: string | undefined): string {
  if (!accountNumber) return 'N/A';
  const last4 = getLast4Digits(accountNumber);
  return `****${last4}`;
}
