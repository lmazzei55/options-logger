// Investment Account Types
export interface InvestmentAccount {
  id: string;
  name: string;
  type: 'brokerage' | 'retirement' | 'margin' | 'cash' | 'other';
  broker: string;
  accountNumber?: string;
  initialCash: number;
  currentCash: number;
  currency: string;
  isActive: boolean;
  createdDate: string;
  notes?: string;
}

// Stock Transaction Types
export interface StockTransaction {
  id: string;
  accountId: string;
  ticker: string;
  companyName?: string;
  action: 'buy' | 'sell' | 'dividend' | 'split' | 'transfer-in' | 'transfer-out';
  shares: number;
  pricePerShare: number;
  totalAmount: number;
  fees: number;
  date: string;
  notes?: string;
  tagIds?: string[];
  splitRatio?: string;
  fromAccountId?: string;
  toAccountId?: string;
}

// Option Transaction Types
export type OptionStrategy = 
  | 'cash-secured-put'
  | 'covered-call'
  | 'long-call'
  | 'long-put'
  | 'credit-spread'
  | 'debit-spread'
  | 'iron-condor'
  | 'straddle'
  | 'strangle'
  | 'other';

export type OptionAction = 
  | 'sell-to-open'
  | 'buy-to-open'
  | 'buy-to-close'
  | 'sell-to-close';

export type OptionStatus = 
  | 'open'
  | 'expired'
  | 'assigned'
  | 'exercised'
  | 'closed';

export interface OptionTransaction {
  id: string;
  accountId: string;
  ticker: string;
  strategy: OptionStrategy;
  optionType: 'call' | 'put';
  action: OptionAction;
  contracts: number;
  strikePrice: number;
  premiumPerShare: number;
  totalPremium: number;
  fees: number;
  expirationDate: string;
  transactionDate: string;
  status: OptionStatus;
  closeDate?: string;
  closePrice?: number;
  realizedPL?: number;
  collateralRequired?: number;
  collateralReleased?: boolean;
  linkedStockTransactionId?: string;
  relatedOptionIds?: string[];
  notes?: string;
  tagIds?: string[];
}

// Position Types (Calculated from Transactions)
export interface StockPosition {
  ticker: string;
  accountId: string;
  shares: number;
  averageCostBasis: number;
  totalCostBasis: number;
  currentPrice?: number;
  marketValue?: number;
  unrealizedPL?: number;
  unrealizedPLPercent?: number;
  firstPurchaseDate: string;
  lastTransactionDate: string;
  transactionIds: string[];
}

export interface OptionPosition {
  id: string;
  ticker: string;
  accountId: string;
  strategy: OptionStrategy;
  optionType: 'call' | 'put';
  contracts: number;
  strikePrice: number;
  expirationDate: string;
  averagePremium: number;
  totalPremium: number;
  status: OptionStatus;
  collateralRequired?: number;
  transactionIds: string[];
  openDate: string;
  closeDate?: string;
  realizedPL?: number;
}

// Tag Types
export interface Tag {
  id: string;
  name: string;
  color: string;
  type: 'stock' | 'option' | 'both';
}

// Template Types
export interface TransactionTemplate {
  id: string;
  name: string;
  type: 'stock' | 'option';
  accountId?: string;
  ticker?: string;
  action?: string;
  shares?: number;
  strategy?: OptionStrategy;
  optionType?: 'call' | 'put';
  contracts?: number;
  strikePrice?: number;
  daysToExpiration?: number;
  notes?: string;
}

// Settings Types
export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  defaultCurrency: string;
  defaultAccountId?: string;
  dateFormat: string;
  showAllAccountsView: boolean;
  enablePriceFetching: boolean;
  chartPreferences: {
    defaultTimeRange: '1M' | '3M' | '6M' | '1Y' | 'ALL';
    defaultChartType: 'line' | 'bar' | 'candlestick';
  };
  taxRates?: {
    shortTerm: number;
    longTerm: number;
  };
}

// Filter Types
export interface TransactionFilters {
  searchQuery?: string;
  accountId?: string;
  type?: 'stock' | 'option' | 'all';
  ticker?: string;
  startDate?: string;
  endDate?: string;
  tagId?: string;
  status?: OptionStatus;
}

// Analytics Types
export interface PortfolioSummary {
  totalValue: number;
  totalCash: number;         // Total cash in accounts (includes collateral)
  availableCash: number;     // Cash available for new trades (excludes collateral)
  activeCollateral: number;  // Cash reserved as collateral for open option positions
  totalInvested: number;
  totalPL: number;
  totalPLPercent: number;
  stockValue: number;
  optionPremiumValue: number; // Net premium from open option positions
  dayChange?: number;
  dayChangePercent?: number;
}

export interface OptionsAnalytics {
  totalPremiumCollected: number;
  totalPremiumPaid: number;
  netPremium: number;
  winRate: number;
  averageReturnPerTrade: number;
  annualizedReturn: number;
  assignmentRate: number;
  averageDaysToClose: number;
  collateralEfficiency: number;
  activeCollateral: number;
  projectedPremium: number;
}

export interface StockAnalytics {
  totalStockValue: number;
  totalCostBasis: number;
  totalUnrealizedPL: number;
  totalRealizedPL: number;
  averageHoldingPeriod: number;
  positionCount: number;
}
