export interface ParsedTransaction {
  date: string; // ISO format (YYYY-MM-DD)
  ticker: string;
  action: 'buy' | 'sell';
  shares: number;
  pricePerShare: number;
  fees?: number;
  notes?: string;
}

export interface ImportResult {
  success: boolean;
  transactions: ParsedTransaction[];
  errors: string[];
  warnings: string[];
}

export interface BrokerParser {
  name: string;
  id: string;
  parse(pdfText: string): ImportResult;
}
