import { describe, it, expect } from 'vitest';
import { IBKRParser } from '../IBKRParser';

const parser = new IBKRParser();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Minimal valid IBKR Transaction History document */
function makeDoc(transactionLines: string): string {
  return `
Interactive Brokers
Transaction History
January 26, 2026 - April 3, 2026

Summary
USD

Transactions
USD
Date Account Description Transaction Type Symbol Quantity Price Price Currency Gross Amount Commission Net Amount

${transactionLines}
  `.trim();
}

// ── Identity ──────────────────────────────────────────────────────────────────

describe('IBKRParser identity', () => {
  it('has correct id and name', () => {
    expect(parser.id).toBe('ibkr');
    expect(parser.name).toBe('IBKR Transaction History');
  });
});

// ── Document validation ───────────────────────────────────────────────────────

describe('document validation', () => {
  it('rejects documents missing Interactive Brokers header', () => {
    const result = parser.parse('Some random PDF text without broker info');
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects documents with Interactive Brokers but no Transaction History', () => {
    const result = parser.parse('Interactive Brokers\nActivity Summary');
    expect(result.success).toBe(false);
  });

  it('accepts valid IBKR Transaction History document', () => {
    const result = parser.parse(makeDoc(''));
    expect(result.success).toBe(true);
  });

  it('warns when no importable transactions found', () => {
    const result = parser.parse(makeDoc(''));
    expect(result.warnings.some(w => /no importable/i.test(w))).toBe(true);
  });
});

// ── Account info ──────────────────────────────────────────────────────────────

describe('account info extraction', () => {
  it('extracts last 4 digits of account number from U***NNNNN pattern', () => {
    const doc = makeDoc('2026-03-25 U***37139 AMD 01MAY26 215 C Sell AMD 260501C00215000 -1.00 15.90 USD 1590.0');
    const result = parser.parse(doc);
    expect(result.accountInfo?.accountNumber).toBe('7139');
    expect(result.accountInfo?.broker).toBe('IBKR');
    expect(result.accountInfo?.accountType).toBe('brokerage');
  });
});

// ── OCC symbol parsing ────────────────────────────────────────────────────────

describe('OCC symbol parsing', () => {
  it('parses call option symbol correctly', () => {
    const doc = makeDoc('2026-03-25 U***37139 AMD 01MAY26 215 C Sell AMD 260501C00215000 -1.00 15.90 USD 1590.0');
    const result = parser.parse(doc);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('AMD');
    expect(t.expirationDate).toBe('2026-05-01');
    expect(t.optionType).toBe('call');
    expect(t.strikePrice).toBe(215.0);
    expect(t.premiumPerShare).toBe(15.90);
    expect(t.contracts).toBe(1);
  });

  it('parses put option symbol correctly', () => {
    const doc = makeDoc('2026-02-27 U***37139 INTC 27MAR26 42 P Sell INTC 260327P00042000 -1.00 1.55 USD 155.0');
    const result = parser.parse(doc);
    const t = result.optionTransactions[0];
    expect(t.ticker).toBe('INTC');
    expect(t.expirationDate).toBe('2026-03-27');
    expect(t.optionType).toBe('put');
    expect(t.strikePrice).toBe(42.0);
  });

  it('parses fractional strike prices correctly', () => {
    const doc = makeDoc('2026-03-25 U***37139 SOFI 10APR26 15.5 P Sell SOFI 260410P00015500 -1.00 0.43 USD 43.0');
    const result = parser.parse(doc);
    expect(result.optionTransactions[0].strikePrice).toBe(15.5);
  });

  it('parses fractional strike prices for NIO', () => {
    const doc = makeDoc('2026-03-25 U***37139 NIO 24APR26 5.5 P Sell NIO 260424P00005500 -5.00 0.25 USD 125.0');
    const result = parser.parse(doc);
    expect(result.optionTransactions[0].strikePrice).toBe(5.5);
    expect(result.optionTransactions[0].contracts).toBe(5);
  });
});

// ── Open/close inference ──────────────────────────────────────────────────────

describe('open/close inference via position tracking', () => {
  it('first sell of an option → sell-to-open', () => {
    const doc = makeDoc('2026-03-25 U***37139 AMD 01MAY26 215 C Sell AMD 260501C00215000 -1.00 15.90 USD 1590.0');
    const result = parser.parse(doc);
    expect(result.optionTransactions[0].action).toBe('sell-to-open');
  });

  it('first buy of an option → buy-to-open', () => {
    const doc = makeDoc('2026-03-10 U***37139 AMD 13MAR26 197.5 C Buy AMD 260313C00197500 1.00 8.55 USD -855.0');
    const result = parser.parse(doc);
    expect(result.optionTransactions[0].action).toBe('buy-to-open');
  });

  it('buy after prior sell-to-open → buy-to-close', () => {
    // Chronological order: sell on 03/10, buy on 03/25 (statement reversed = older first)
    const doc = makeDoc([
      // Statement is newest-first; parser reverses internally
      '2026-03-25 U***37139 AMD 27MAR26 205 C Buy AMD 260327C00205000 1.00 12.57 USD -1257.0',
      '2026-03-10 U***37139 AMD 27MAR26 205 C Sell AMD 260327C00205000 -1.00 9.40 USD 940.0',
    ].join('\n'));
    const result = parser.parse(doc);
    const sellTxn = result.optionTransactions.find(t => t.action === 'sell-to-open');
    const buyTxn  = result.optionTransactions.find(t => t.action === 'buy-to-close');
    expect(sellTxn).toBeDefined();
    expect(buyTxn).toBeDefined();
  });

  it('sell after prior buy-to-open → sell-to-close', () => {
    const doc = makeDoc([
      '2026-03-09 U***37139 AMD 13MAR26 197.5 C Sell AMD 260313C00197500 -1.00 4.75 USD 475.0',
      '2026-03-10 U***37139 AMD 13MAR26 197.5 C Buy AMD 260313C00197500 1.00 8.55 USD -855.0',
    ].join('\n'));
    const result = parser.parse(doc);
    const buyTxn  = result.optionTransactions.find(t => t.action === 'buy-to-open');
    const sellTxn = result.optionTransactions.find(t => t.action === 'sell-to-close');
    expect(buyTxn).toBeDefined();
    expect(sellTxn).toBeDefined();
  });

  it('different option keys do not interfere with each other', () => {
    const doc = makeDoc([
      '2026-03-25 U***37139 SOFI 10APR26 15.5 P Sell SOFI 260410P00015500 -1.00 0.43 USD 43.0',
      '2026-03-25 U***37139 NIO 24APR26 5.5 P Sell NIO 260424P00005500 -5.00 0.25 USD 125.0',
    ].join('\n'));
    const result = parser.parse(doc);
    expect(result.optionTransactions).toHaveLength(2);
    result.optionTransactions.forEach(t => expect(t.action).toBe('sell-to-open'));
  });
});

// ── Assignment ────────────────────────────────────────────────────────────────

describe('assignment parsing', () => {
  it('parses assignment as a stock buy', () => {
    const doc = makeDoc(
      '2026-03-06 U***37139 Buy 100 ADVANCED MICRO DEVICES (Assignment) Assignment AMD 100.00 195.00 USD -19500.0'
    );
    const result = parser.parse(doc);
    expect(result.transactions).toHaveLength(1);
    const t = result.transactions[0];
    expect(t.ticker).toBe('AMD');
    expect(t.action).toBe('buy');
    expect(t.shares).toBe(100);
    expect(t.pricePerShare).toBe(195.0);
    expect(t.date).toBe('2026-03-06');
    expect(t.notes).toMatch(/assignment/i);
  });
});

// ── Skipped line types ────────────────────────────────────────────────────────

describe('skipped line types', () => {
  const skippedLines = [
    '2026-04-02 U***37139 l*****55:US Securities Snapshot and Futures Value Bundle Non-Professional for Apr 2026 Other Fee - - - - -10.0',
    '2026-02-05 U***37139 Electronic Fund Transfer Deposit - - - - 12016.0',
    '2026-02-06 U***37139 Disbursement (From CAPITAL ONE.) Withdrawal - - - - -0.36',
    '2026-03-04 U***37139 USD Credit Interest for Feb-2026 Credit Interest - - - - 7.92',
  ];

  skippedLines.forEach((line, i) => {
    it(`skips line type ${i + 1}: ${line.split(' ').slice(2, 5).join(' ')}...`, () => {
      const result = parser.parse(makeDoc(line));
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions).toHaveLength(0);
    });
  });
});

// ── Dates ─────────────────────────────────────────────────────────────────────

describe('date parsing', () => {
  it('preserves ISO date from IBKR (no conversion needed)', () => {
    const doc = makeDoc('2026-03-25 U***37139 AMD 01MAY26 215 C Sell AMD 260501C00215000 -1.00 15.90 USD 1590.0');
    const result = parser.parse(doc);
    expect(result.optionTransactions[0].date).toBe('2026-03-25');
  });
});

// ── Full document scenario ────────────────────────────────────────────────────

describe('full document scenario (sample PDF)', () => {
  // Reproduces the sample Transaction History PDF (Jan 26 – Apr 3, 2026)
  // Statement is newest-first as it appears in the PDF
  const fullDoc = `
Interactive Brokers
Transaction History
January 26, 2026 - April 3, 2026

Summary
USD

Transactions
USD
Date Account Description Transaction Type Symbol Quantity Price Price Currency Gross Amount Commission Net Amount
2026-04-02 U***37139 l*****55:US Securities Snapshot and Futures Value Bundle Non-Professional for Apr 2026 Other Fee - - - - -10.0
2026-04-02 U***37139 l*****55:US Equity and Options Add-On Streaming Bundle Non-Professional for Apr 2026 Other Fee - - - - -4.5
2026-03-25 U***37139 AMD 01MAY26 215 C Sell AMD 260501C00215000 -1.00 15.90 USD 1590.0
2026-03-25 U***37139 AMD 27MAR26 205 C Buy AMD 260327C00205000 1.00 12.57 USD -1257.0
2026-03-25 U***37139 SOFI 10APR26 15.5 P Sell SOFI 260410P00015500 -1.00 0.43 USD 43.0
2026-03-25 U***37139 NIO 24APR26 5.5 P Sell NIO 260424P00005500 -5.00 0.25 USD 125.0
2026-03-20 U***37139 l*****55:US Securities Snapshot and Futures Value Bundle Non-Professional for Mar 2026 Other Fee - - - - -10.0
2026-03-20 U***37139 l*****55:US Equity and Options Add-On Streaming Bundle Non-Professional for Mar 2026 Other Fee - - - - -4.5
2026-03-18 U***37139 INTC 27MAR26 42 P Buy INTC 260327P00042000 1.00 0.69 USD -69.0
2026-03-10 U***37139 AMD 13MAR26 197.5 C Buy AMD 260313C00197500 1.00 8.55 USD -855.0
2026-03-10 U***37139 AMD 27MAR26 205 C Sell AMD 260327C00205000 -1.00 9.40 USD 940.0
2026-03-09 U***37139 AMD 13MAR26 197.5 C Sell AMD 260313C00197500 -1.00 4.75 USD 475.0
2026-03-06 U***37139 Buy 100 ADVANCED MICRO DEVICES (Assignment) Assignment AMD 100.00 195.00 USD -19500.0
2026-03-04 U***37139 USD Credit Interest for Feb-2026 Credit Interest - - - - 7.92
2026-02-27 U***37139 INTC 27MAR26 42 P Sell INTC 260327P00042000 -1.00 1.55 USD 155.0
2026-02-27 U***37139 AMD 06MAR26 195 P Sell AMD 260306P00195000 -1.00 3.70 USD 370.0
2026-02-06 U***37139 Electronic Fund Transfer (FROM CAPITAL ONE) Deposit - - - - 0.23
2026-02-06 U***37139 Disbursement (From CAPITAL ONE.) Withdrawal - - - - -0.36
2026-02-05 U***37139 Electronic Fund Transfer Deposit - - - - 12016.0
  `.trim();

  it('parses correct number of option transactions', () => {
    const result = parser.parse(fullDoc);
    expect(result.success).toBe(true);
    // Options: AMD 215C sell, AMD 205C buy, SOFI 15.5P sell, NIO 5.5P sell,
    //          INTC 42P buy, AMD 197.5C buy, AMD 205C sell, AMD 197.5C sell,
    //          INTC 42P sell, AMD 195P sell = 10 option trades
    expect(result.optionTransactions).toHaveLength(10);
  });

  it('parses correct number of stock transactions (assignment)', () => {
    const result = parser.parse(fullDoc);
    // Only 1 stock assignment: AMD 100 shares @ $195
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0].ticker).toBe('AMD');
    expect(result.transactions[0].shares).toBe(100);
  });

  it('correctly infers sell-to-open for AMD 205C on 03/10 (first occurrence)', () => {
    const result = parser.parse(fullDoc);
    const t = result.optionTransactions.find(
      t => t.ticker === 'AMD' && t.strikePrice === 205 && t.date === '2026-03-10'
    );
    expect(t?.action).toBe('sell-to-open');
  });

  it('correctly infers buy-to-close for AMD 205C on 03/25 (after prior short)', () => {
    const result = parser.parse(fullDoc);
    const t = result.optionTransactions.find(
      t => t.ticker === 'AMD' && t.strikePrice === 205 && t.date === '2026-03-25'
    );
    expect(t?.action).toBe('buy-to-close');
  });

  it('correctly infers AMD 197.5C: sell-to-open on 03/09, buy-to-close on 03/10', () => {
    // Chronologically: 03/09 sell comes first → sell-to-open (short position).
    // 03/10 buy comes next → buy-to-close (covers the short).
    const result = parser.parse(fullDoc);
    const sell = result.optionTransactions.find(
      t => t.ticker === 'AMD' && t.strikePrice === 197.5 && t.date === '2026-03-09'
    );
    const buy = result.optionTransactions.find(
      t => t.ticker === 'AMD' && t.strikePrice === 197.5 && t.date === '2026-03-10'
    );
    expect(sell?.action).toBe('sell-to-open');
    expect(buy?.action).toBe('buy-to-close');
  });

  it('sell-to-open for AMD 01MAY26 215C (new position)', () => {
    const result = parser.parse(fullDoc);
    const t = result.optionTransactions.find(
      t => t.ticker === 'AMD' && t.strikePrice === 215 && t.expirationDate === '2026-05-01'
    );
    expect(t?.action).toBe('sell-to-open');
    expect(t?.premiumPerShare).toBeCloseTo(15.90, 2);
  });

  it('INTC 42P: sell-to-open on 02/27, buy-to-close on 03/18', () => {
    const result = parser.parse(fullDoc);
    const sell = result.optionTransactions.find(
      t => t.ticker === 'INTC' && t.date === '2026-02-27'
    );
    const buy = result.optionTransactions.find(
      t => t.ticker === 'INTC' && t.date === '2026-03-18'
    );
    expect(sell?.action).toBe('sell-to-open');
    expect(buy?.action).toBe('buy-to-close');
  });

  it('produces informational warning', () => {
    const result = parser.parse(fullDoc);
    expect(result.warnings.some(w => /open\/close/i.test(w))).toBe(true);
  });
});
