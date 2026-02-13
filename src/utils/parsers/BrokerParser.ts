export interface ParsedTransaction {
  date: string; // ISO format (YYYY-MM-DD)
  ticker: string;
  action: 'buy' | 'sell';
  shares: number;
  pricePerShare: number;
  fees?: number;
  notes?: string;
}

export interface ParsedOptionTransaction {
  date: string; // ISO format (YYYY-MM-DD)
  ticker: string;
  optionType: 'call' | 'put';
  action: 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close';
  contracts: number;
  strikePrice: number;
  premiumPerShare: number; // Premium per share (multiply by 100 for per-contract)
  expirationDate: string; // ISO format (YYYY-MM-DD)
  fees?: number;
  notes?: string;
}

export interface ImportResult {
  success: boolean;
  transactions: ParsedTransaction[];
  optionTransactions: ParsedOptionTransaction[];
  errors: string[];
  warnings: string[];
}

export interface BrokerParser {
  name: string;
  id: string;
  parse(pdfText: string): ImportResult;
}
