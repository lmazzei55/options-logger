import type {
  InvestmentAccount,
  StockTransaction,
  OptionTransaction,
  Tag,
  TransactionTemplate
} from '../types';
import { generateId } from './calculations';

export const generateMockData = () => {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  // =============================================
  // ACCOUNTS
  // =============================================
  // Cash balances reflect the RESULT of all transactions below.
  // loadMockData() sets these directly (bypasses addTransaction cash logic).
  //
  // acc-1: Main Brokerage (initialCash = $50,000)
  //   Stock buys: AAPL 50sh * $175.50 = -$8,775 | MSFT 30sh * $380 = -$11,400
  //   Option premium: CC on AAPL expired +$350 -$1 fee = +$349
  //   Option premium: CSP on MSFT open +$275 -$1 fee = +$274
  //   currentCash = 50000 - 8775 - 11400 + 349 + 274 = $30,448
  //
  // acc-2: Retirement IRA (initialCash = $100,000)
  //   Stock buys: SPY 50sh * $450 = -$22,500 | VTI 50sh * $220 = -$11,000
  //   No options (IRA, long-term only)
  //   currentCash = 100000 - 22500 - 11000 = $66,500
  //
  // acc-3: Options Trading (initialCash = $75,000)
  //   Option premium: CSP AAPL open +$350 -$1 fee = +$349
  //   Option premium: CSP SPY closed: open +$1200 -$2 fee, close -$450 = net +$748
  //   Option premium: CSP NVDA assigned: +$400 -$1 fee = +$399, then stock buy -$20,000
  //   Option premium: Long call TSLA closed: open -$2500 -$2 fee, close +$3600 = net +$1098
  //   Option premium: CSP SPY open +$375 -$1 fee = +$374
  //   currentCash = 75000 + 349 + 748 + 399 - 20000 + 1098 + 374 = $57,968

  const accounts: InvestmentAccount[] = [
    {
      id: 'acc-1',
      name: 'Main Brokerage',
      type: 'brokerage',
      broker: 'Fidelity',
      accountNumber: '1234',
      initialCash: 50000,
      currentCash: 30448,
      currency: 'USD',
      isActive: true,
      createdDate: sixMonthsAgo.toISOString().split('T')[0],
      notes: 'Primary trading account'
    },
    {
      id: 'acc-2',
      name: 'Retirement IRA',
      type: 'retirement',
      broker: 'Vanguard',
      accountNumber: '5678',
      initialCash: 100000,
      currentCash: 66500,
      currency: 'USD',
      isActive: true,
      createdDate: sixMonthsAgo.toISOString().split('T')[0],
      notes: 'Long-term retirement savings'
    },
    {
      id: 'acc-3',
      name: 'Options Trading',
      type: 'margin',
      broker: 'Tastyworks',
      accountNumber: '9012',
      initialCash: 75000,
      currentCash: 57968,
      currency: 'USD',
      isActive: true,
      createdDate: sixMonthsAgo.toISOString().split('T')[0],
      notes: 'Dedicated options account'
    }
  ];

  // =============================================
  // STOCK TRANSACTIONS
  // =============================================
  const nvdaAssignmentId = generateId();

  const stockTransactions: StockTransaction[] = [
    // acc-1: AAPL position - 50 shares @ $175.50
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      action: 'buy',
      shares: 50,
      pricePerShare: 175.50,
      totalAmount: 8775,
      fees: 0,
      date: new Date(now.getTime() - 150 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Initial position - 50 shares'
    },
    // acc-1: MSFT position - 30 shares @ $380
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'MSFT',
      companyName: 'Microsoft Corporation',
      action: 'buy',
      shares: 30,
      pricePerShare: 380.00,
      totalAmount: 11400,
      fees: 0,
      date: new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Tech diversification'
    },
    // acc-2: SPY position - 50 shares @ $450
    {
      id: generateId(),
      accountId: 'acc-2',
      ticker: 'SPY',
      companyName: 'SPDR S&P 500 ETF',
      action: 'buy',
      shares: 50,
      pricePerShare: 450.00,
      totalAmount: 22500,
      fees: 0,
      date: new Date(now.getTime() - 160 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Core holding'
    },
    // acc-2: VTI position - 50 shares @ $220
    {
      id: generateId(),
      accountId: 'acc-2',
      ticker: 'VTI',
      companyName: 'Vanguard Total Stock Market ETF',
      action: 'buy',
      shares: 50,
      pricePerShare: 220.00,
      totalAmount: 11000,
      fees: 0,
      date: new Date(now.getTime() - 140 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Broad market exposure'
    },
    // acc-3: NVDA from CSP assignment - 100 shares @ $200
    {
      id: nvdaAssignmentId,
      accountId: 'acc-3',
      ticker: 'NVDA',
      companyName: 'NVIDIA Corporation',
      action: 'buy',
      shares: 100,
      pricePerShare: 200.00,
      totalAmount: 20000,
      fees: 0,
      date: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      notes: 'Assigned from cash-secured-put: 1 put contract(s) at $200 strike'
    }
  ];

  // =============================================
  // OPTION TRANSACTIONS
  // =============================================
  const optionTransactions: OptionTransaction[] = [
    // --- OPEN POSITIONS ---

    // acc-3: Open CSP on AAPL (1 contract, $170 strike, expiring in 15 days)
    // Premium: 1 * 100 * $3.50 = $350
    // Collateral: 1 * 100 * $170 = $17,000
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'AAPL',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 170.00,
      premiumPerShare: 3.50,
      totalPremium: 350,
      fees: 1,
      expirationDate: new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open',
      collateralRequired: 17000,
      collateralReleased: false,
      notes: 'Monthly CSP on AAPL'
    },

    // acc-1: Open CSP on MSFT (1 contract, $370 strike, expiring in 25 days)
    // Premium: 1 * 100 * $2.75 = $275
    // Collateral: 1 * 100 * $370 = $37,000
    // Note: acc-1 has $30,448 cash. Collateral > cash, but this is a brokerage account.
    // In practice, margin might cover this. We show it as a warning in the UI.
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'MSFT',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 370.00,
      premiumPerShare: 2.75,
      totalPremium: 275,
      fees: 1,
      expirationDate: new Date(now.getTime() + 25 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open',
      collateralRequired: 37000,
      collateralReleased: false,
      notes: 'Monthly CSP on MSFT'
    },

    // acc-3: Open CSP on SPY (1 contract, $450 strike, expiring in 7 days)
    // Premium: 1 * 100 * $3.75 = $375
    // Collateral: 1 * 100 * $450 = $45,000
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'SPY',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 450.00,
      premiumPerShare: 3.75,
      totalPremium: 375,
      fees: 1,
      expirationDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 23 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'open',
      collateralRequired: 45000,
      collateralReleased: false,
      notes: 'Weekly SPY put'
    },

    // --- CLOSED POSITIONS ---

    // acc-1: Expired worthless covered call on AAPL
    // Premium: 1 * 100 * $3.50 = $350
    // P&L: $350 - $1 fee = $349
    {
      id: generateId(),
      accountId: 'acc-1',
      ticker: 'AAPL',
      strategy: 'covered-call',
      optionType: 'call',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 185.00,
      premiumPerShare: 3.50,
      totalPremium: 350,
      fees: 1,
      expirationDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'expired',
      closeDate: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      realizedPL: 349,
      notes: 'Expired worthless - kept full premium'
    },

    // acc-3: Closed CSP on SPY (bought to close at ~62% profit)
    // Open premium: 3 * 100 * $4.00 = $1,200
    // Close cost: 3 * 100 * $1.50 = $450
    // P&L: $1200 - $450 - $2 fees = $748
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'SPY',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 3,
      strikePrice: 445.00,
      premiumPerShare: 4.00,
      totalPremium: 1200,
      fees: 2,
      expirationDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'closed',
      closeDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      closePrice: 1.50,
      realizedPL: 748,
      collateralRequired: 133500,
      collateralReleased: true,
      notes: 'Closed early for ~62% profit'
    },

    // acc-3: Assigned CSP on NVDA (resulted in stock purchase)
    // Premium: 1 * 100 * $4.00 = $400
    // P&L on option: $400 - $1 fee = $399 (premium kept)
    // Stock acquired: 100 shares at $200 = $20,000 (deducted from cash separately)
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'NVDA',
      strategy: 'cash-secured-put',
      optionType: 'put',
      action: 'sell-to-open',
      contracts: 1,
      strikePrice: 200.00,
      premiumPerShare: 4.00,
      totalPremium: 400,
      fees: 1,
      expirationDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'assigned',
      closeDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      realizedPL: 399,
      collateralRequired: 20000,
      collateralReleased: true,
      linkedStockTransactionId: nvdaAssignmentId,
      notes: 'Assigned - acquired 100 shares of NVDA at $200'
    },

    // acc-3: Closed long call on TSLA (profitable)
    // Bought at: 2 * 100 * $12.50 = $2,500
    // Sold at: 2 * 100 * $18.00 = $3,600
    // P&L: $3600 - $2500 - $2 fees = $1,098
    {
      id: generateId(),
      accountId: 'acc-3',
      ticker: 'TSLA',
      strategy: 'long-call',
      optionType: 'call',
      action: 'buy-to-open',
      contracts: 2,
      strikePrice: 250.00,
      premiumPerShare: 12.50,
      totalPremium: 2500,
      fees: 2,
      expirationDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      transactionDate: new Date(now.getTime() - 105 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'closed',
      closeDate: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      closePrice: 18.00,
      realizedPL: 1098,
      notes: 'Sold for profit before expiration'
    }
  ];

  // =============================================
  // TAGS
  // =============================================
  const tags: Tag[] = [
    { id: 'tag-1', name: 'High Conviction', color: '#10b981', type: 'both' },
    { id: 'tag-2', name: 'Speculative', color: '#f59e0b', type: 'both' },
    { id: 'tag-3', name: 'Income Strategy', color: '#3b82f6', type: 'option' },
    { id: 'tag-4', name: 'Hedge', color: '#ef4444', type: 'option' },
    { id: 'tag-5', name: 'Earnings Play', color: '#8b5cf6', type: 'both' }
  ];

  // =============================================
  // TEMPLATES
  // =============================================
  const templates: TransactionTemplate[] = [
    {
      id: 'template-1',
      name: 'Weekly CSP on SPY',
      type: 'option',
      accountId: 'acc-3',
      ticker: 'SPY',
      strategy: 'cash-secured-put',
      optionType: 'put',
      contracts: 1,
      daysToExpiration: 7,
      notes: 'Weekly income strategy'
    },
    {
      id: 'template-2',
      name: 'Monthly CSP on AAPL',
      type: 'option',
      accountId: 'acc-3',
      ticker: 'AAPL',
      strategy: 'cash-secured-put',
      optionType: 'put',
      contracts: 1,
      daysToExpiration: 30,
      notes: 'Monthly income play'
    },
    {
      id: 'template-3',
      name: 'Buy 100 shares',
      type: 'stock',
      accountId: 'acc-1',
      action: 'buy',
      shares: 100,
      notes: 'Standard lot purchase'
    }
  ];

  return {
    accounts,
    stockTransactions,
    optionTransactions,
    tags,
    templates
  };
};
