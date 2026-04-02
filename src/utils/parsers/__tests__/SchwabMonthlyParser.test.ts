import { describe, it, expect } from 'vitest';
import { SchwabMonthlyParser } from '../SchwabMonthlyParser';

/**
 * Tests reflect the actual pdfjs-extracted text from a real January 2026
 * Schwab statement (after glyph-merging in pdfExtractor).
 *
 * Key format observations from the debug output:
 *
 * A) SOFI sell — expiry on same line:
 *    "01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67"
 *    "26.00 P EXP 01/16/26"
 *
 * B) AEHR buy — expiry on CONTINUATION line:
 *    "01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)"
 *    "01/15/2027 35.00 EXP 01/15/27 C"
 *
 * C) NVDA expired short — "Activity" wraps to next line:
 *    "01/20 Other Expired Short NVDA CALL NVIDIA CORP $200 EXP (1.0000)"
 *    "Activity 01/16/2026 01/16/26 200.00 C"
 *
 * D) SOFI expired long — no leading date, expiry on same line:
 *    "Other Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 2.0000"
 *    "Activity 26.00 P EXP 01/16/26"
 */
describe('SchwabMonthlyParser', () => {
  const parser = new SchwabMonthlyParser();

  describe('Basic Parser Properties', () => {
    it('should have correct name and id', () => {
      expect(parser.name).toBe('Schwab Monthly Statement');
      expect(parser.id).toBe('schwab-monthly');
    });
  });

  describe('Error Handling', () => {
    it('should return success with warning when Transaction Details section is missing', () => {
      const result = parser.parse('Some random text without the required section');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions).toHaveLength(0);
      expect(result.warnings[0]).toContain('No Transaction Details section found');
    });

    it('should handle empty PDF text gracefully', () => {
      const result = parser.parse('');
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions).toHaveLength(0);
    });

    it('should handle malformed data gracefully', () => {
      const pdfText = 'Transaction Details\nINVALID DATA HERE\nTotal Transactions';
      const result = parser.parse(pdfText);
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(Array.isArray(result.optionTransactions)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Format A: expiry on the SAME line as the transaction
  // ---------------------------------------------------------------------------
  describe('Format A — expiry on same line (SOFI sell-to-open)', () => {
    it('should parse a sell-to-open put', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67',
        '26.00 P EXP 01/16/26',
        'Commission $1.30; Industry Fee $0.03',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions[0]).toMatchObject({
        date: '2026-01-13',
        ticker: 'SOFI',
        optionType: 'put',
        action: 'sell-to-open',
        contracts: 2,
        strikePrice: 26,
        premiumPerShare: 0.32,
        expirationDate: '2026-01-16',
        fees: 1.33
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Format B: expiry on CONTINUATION line (AEHR buy-to-open)
  // ---------------------------------------------------------------------------
  describe('Format B — expiry on continuation line (AEHR buy-to-open)', () => {
    it('should parse a buy-to-open call with expiry on next line', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)',
        '01/15/2027 35.00 EXP 01/15/27 C',
        'Commission $0.65; Industry Fee $0.01',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions[0]).toMatchObject({
        date: '2026-01-22',
        ticker: 'AEHR',
        optionType: 'call',
        action: 'buy-to-open',
        contracts: 1,
        strikePrice: 35,
        premiumPerShare: 8.25,
        expirationDate: '2027-01-15',
        fees: 0.66
      });
    });

    it('should parse a second buy-to-open call (AEHR $40)', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/27 Purchase AEHR CALL AEHR TEST SYS $40 1.0000 6.5800 0.66 (658.66)',
        '01/15/2027 40.00 EXP 01/15/27 C',
        'Commission $0.65; Industry Fee $0.01',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'AEHR',
        strikePrice: 40,
        premiumPerShare: 6.58,
        expirationDate: '2027-01-15'
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Format C: "Activity" wraps to next line (NVDA expired short)
  // ---------------------------------------------------------------------------
  describe('Format C — "Other Activity" split across lines (NVDA expired short)', () => {
    it('should parse expired short as buy-to-close at $0', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/20 Other Expired Short NVDA CALL NVIDIA CORP $200 EXP (1.0000)',
        'Activity 01/16/2026 01/16/26 200.00 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        date: '2026-01-16', // expired options use expiration date as txn date
        ticker: 'NVDA',
        optionType: 'call',
        action: 'buy-to-close',
        contracts: 1,
        strikePrice: 200,
        premiumPerShare: 0,
        expirationDate: '2026-01-16',
        fees: 0
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Format D: no leading date, "Other Expired Long", expiry same line
  // ---------------------------------------------------------------------------
  describe('Format D — no leading date, expired long (SOFI expired long)', () => {
    it('should parse expired long as sell-to-close at $0, inheriting date', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/20 Other Expired Short NVDA CALL NVIDIA CORP $200 EXP (1.0000)',
        'Activity 01/16/2026 01/16/26 200.00 C',
        'Other Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 2.0000',
        'Activity 26.00 P EXP 01/16/26',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.optionTransactions).toHaveLength(2);
      const sofi = result.optionTransactions[1];
      expect(sofi).toMatchObject({
        date: '2026-01-16', // expired options use expiration date as txn date
        ticker: 'SOFI',
        optionType: 'put',
        action: 'sell-to-close',
        contracts: 2,
        strikePrice: 26,
        premiumPerShare: 0,
        expirationDate: '2026-01-16',
        fees: 0
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Full real statement — all 5 option transactions
  // ---------------------------------------------------------------------------
  describe('Full January 2026 statement', () => {
    const fullStatement = [
      'January 1-31, 2026',
      'Transaction Details',
      // SOFI sell-to-open (Format A)
      '01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67',
      '26.00 P EXP 01/16/26',
      'Commission $1.30; Industry Fee $0.03',
      // NVDA expired short (Format C)
      '01/20 Other Expired Short NVDA CALL NVIDIA CORP $200 EXP (1.0000)',
      'Activity 01/16/2026 01/16/26 200.00 C',
      // SOFI expired long (Format D)
      'Other Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 2.0000',
      'Activity 26.00 P EXP 01/16/26',
      // AEHR $35 buy-to-open (Format B)
      '01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)',
      '01/15/2027 35.00 EXP 01/15/27 C',
      'Commission $0.65; Industry Fee $0.01',
      // AEHR $40 buy-to-open (Format B)
      '01/27 Purchase AEHR CALL AEHR TEST SYS $40 1.0000 6.5800 0.66 (658.66)',
      '01/15/2027 40.00 EXP 01/15/27 C',
      'Commission $0.65; Industry Fee $0.01',
      'Total Transactions (1,421.65)'
    ].join('\n');

    it('should parse all 5 option transactions with no stock transactions', () => {
      const result = parser.parse(fullStatement);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions).toHaveLength(5);
    });

    it('should identify each transaction correctly', () => {
      const result = parser.parse(fullStatement);
      const opts = result.optionTransactions;

      expect(opts[0]).toMatchObject({ ticker: 'SOFI', action: 'sell-to-open', contracts: 2, strikePrice: 26 });
      expect(opts[1]).toMatchObject({ ticker: 'NVDA', action: 'buy-to-close', contracts: 1, strikePrice: 200 });
      expect(opts[2]).toMatchObject({ ticker: 'SOFI', action: 'sell-to-close', contracts: 2, strikePrice: 26 });
      expect(opts[3]).toMatchObject({ ticker: 'AEHR', action: 'buy-to-open', contracts: 1, strikePrice: 35 });
      expect(opts[4]).toMatchObject({ ticker: 'AEHR', action: 'buy-to-open', contracts: 1, strikePrice: 40 });
    });

    it('should assign correct dates', () => {
      const result = parser.parse(fullStatement);
      const opts = result.optionTransactions;

      expect(opts[0].date).toBe('2026-01-13'); // sale: settlement date
      expect(opts[1].date).toBe('2026-01-16'); // expired short: use expiration date
      expect(opts[2].date).toBe('2026-01-16'); // expired long: use expiration date
      expect(opts[3].date).toBe('2026-01-22'); // purchase: settlement date
      expect(opts[4].date).toBe('2026-01-27'); // purchase: settlement date
    });

    it('should assign correct expiration dates', () => {
      const result = parser.parse(fullStatement);
      const opts = result.optionTransactions;

      expect(opts[0].expirationDate).toBe('2026-01-16');
      expect(opts[1].expirationDate).toBe('2026-01-16');
      expect(opts[2].expirationDate).toBe('2026-01-16');
      expect(opts[3].expirationDate).toBe('2027-01-15');
      expect(opts[4].expirationDate).toBe('2027-01-15');
    });

    it('should assign correct premiums and fees', () => {
      const result = parser.parse(fullStatement);
      const opts = result.optionTransactions;

      expect(opts[0].premiumPerShare).toBe(0.32);
      expect(opts[0].fees).toBe(1.33);
      expect(opts[1].premiumPerShare).toBe(0);
      expect(opts[1].fees).toBe(0);
      expect(opts[2].premiumPerShare).toBe(0);
      expect(opts[2].fees).toBe(0);
      expect(opts[3].premiumPerShare).toBe(8.25);
      expect(opts[3].fees).toBe(0.66);
      expect(opts[4].premiumPerShare).toBe(6.58);
      expect(opts[4].fees).toBe(0.66);
    });
  });

  // ---------------------------------------------------------------------------
  // Format E — "Sale Short Sale" (short sale / sell-to-open via short)
  // Format F — "Purchase Cover Short" (buy-to-close a short position)
  // October 2025 statement patterns
  // ---------------------------------------------------------------------------
  describe('Format E/F — Short Sale and Cover Short actions (October 2025)', () => {
    it('should parse Short Sale as sell-to-open', () => {
      const pdfText = [
        'October 1-31, 2025',
        'Transaction Details',
        '10/14 Sale Short Sale ASTS CALL AST SPACEMOBILE INC$75 EXP 12/17/27 (1.0000) 46.9200 0.66 4,691.34',
        '12/17/2027 75.00 C',
        'Commission $0.65; Industry Fee $0.01',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        date: '2025-10-14',
        ticker: 'ASTS',
        optionType: 'call',
        action: 'sell-to-open',
        contracts: 1,
        strikePrice: 75,
        premiumPerShare: 46.92,
        expirationDate: '2027-12-17',
        fees: 0.66
      });
    });

    it('should parse Cover Short as buy-to-close', () => {
      const pdfText = [
        'October 1-31, 2025',
        'Transaction Details',
        '10/14 Sale Short Sale ASTS CALL AST SPACEMOBILE INC$75 EXP 12/17/27 (1.0000) 46.9200 0.66 4,691.34',
        '12/17/2027 75.00 C',
        'Commission $0.65; Industry Fee $0.01',
        'Purchase Cover Short ASTS CALL AST SPACEMOBILE INC$50 EXP 10/24/25 1.0000 37.2700 0.66 (3,727.66) (3,273.32)(ST)',
        '10/24/2025 50.00 C',
        'Commission $0.65; Industry Fee $0.01',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.optionTransactions).toHaveLength(2);
      expect(result.optionTransactions[1]).toMatchObject({
        date: '2025-10-14', // inherits date from preceding Short Sale line
        ticker: 'ASTS',
        optionType: 'call',
        action: 'buy-to-close',
        contracts: 1,
        strikePrice: 50,
        premiumPerShare: 37.27,
        expirationDate: '2025-10-24',
        fees: 0.66
      });
    });

    it('should handle (ST) gain/loss annotation without breaking number extraction', () => {
      // The ,(ST) suffix on realized gain column must not block parsing
      const pdfText = [
        'November 1-30, 2025',
        'Transaction Details',
        '11/18 Sale AEHR PUT AEHR TEST SYS $22.5 (2.0000) 2.6400 1.33 526.67 105.35,(ST)',
        '11/21/2025 22.50 EXP 11/21/25',
        'P',
        'Commission $1.30; Industry Fee $0.03',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        date: '2025-11-18',
        ticker: 'AEHR',
        optionType: 'put',
        contracts: 2,
        strikePrice: 22.5,
        premiumPerShare: 2.64,
        fees: 1.33
      });
    });

    it('should parse October 2025 full statement: ASTS short sale + cover short + AEHR purchase', () => {
      const pdfText = [
        'October 1-31, 2025',
        'Transaction Details',
        '10/02 Redemption Cash-In-Lieu WOLF WOLFSPEED INC 10.67',
        '10/14 Sale Short Sale ASTS CALL AST SPACEMOBILE INC$75 EXP 12/17/27 (1.0000) 46.9200 0.66 4,691.34',
        '12/17/2027 75.00 C',
        'Commission $0.65; Industry Fee $0.01',
        'Purchase Cover Short ASTS CALL AST SPACEMOBILE INC$50 EXP 10/24/25 1.0000 37.2700 0.66 (3,727.66) (3,273.32)(ST)',
        '10/24/2025 50.00 C',
        'Commission $0.65; Industry Fee $0.01',
        'Purchase AEHR PUT AEHR TEST SYS $22.5 EXP 11/21/25 2.0000 2.1000 1.32 (421.32)',
        '11/21/2025 22.50 P',
        'Commission $1.30; Industry Fee $0.02',
        'Total Transactions $553.03 ($3,273.32)'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions).toHaveLength(3);

      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'ASTS', action: 'sell-to-open', contracts: 1, strikePrice: 75, date: '2025-10-14'
      });
      expect(result.optionTransactions[1]).toMatchObject({
        ticker: 'ASTS', action: 'buy-to-close', contracts: 1, strikePrice: 50, date: '2025-10-14'
      });
      expect(result.optionTransactions[2]).toMatchObject({
        ticker: 'AEHR', action: 'buy-to-open', contracts: 2, strikePrice: 22.5, date: '2025-10-14'
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Stock transactions
  // ---------------------------------------------------------------------------
  describe('Stock Transactions', () => {
    it('should parse a stock purchase', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/15 Purchase AAPL APPLE INC 100 150.00 15000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        date: '2026-01-15',
        ticker: 'AAPL',
        action: 'buy',
        shares: 100,
        pricePerShare: 150
      });
    });

    it('should parse a stock sale', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/20 Sale TSLA TESLA INC 50 200.00 10000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({ ticker: 'TSLA', action: 'sell', shares: 50 });
    });
  });

  // ---------------------------------------------------------------------------
  // Date handling
  // ---------------------------------------------------------------------------
  describe('Date handling', () => {
    it('should extract year from statement period header', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)',
        '01/15/2027 35.00 EXP 01/15/27 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.optionTransactions[0].date).toContain('2026');
    });

    it('should use current year when statement period not found', () => {
      const pdfText = [
        'Transaction Details',
        '01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)',
        '01/15/2027 35.00 EXP 01/15/27 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      const currentYear = new Date().getFullYear().toString();
      expect(result.optionTransactions[0].date).toContain(currentYear);
    });

    it('should handle Transaction Details split across lines', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction',
        'Details',
        '01/22 Purchase AEHR CALL AEHR TEST SYS $35 1.0000 8.2500 0.66 (825.66)',
        '01/15/2027 35.00 EXP 01/15/27 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Statements with no importable transactions
  // ---------------------------------------------------------------------------
  describe('Statements with no importable trades', () => {
    it('should succeed with warning when no Transaction Details section exists (e.g. December with zero trades)', () => {
      // Mirrors a statement where the period had zero activity — no Transaction Details page at all
      const pdfText = [
        'December 1-31, 2025',
        'Transactions Summary',
        'Purchases 0.00',
        'Sales 0.00',
        'Total 0.00'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('No Transaction Details section found'))).toBe(true);
    });

    it('should succeed with warning when Transaction Details has only corporate actions (e.g. Liquidation, Redemption)', () => {
      // Mirrors February 2026 statement with WOLF liquidation + redemption cash-in-lieu
      const pdfText = [
        'February 1-28, 2026',
        'Transaction Details',
        '02/04 Other Activity Liquidation WOLF WOLFSPEED INC 5.0000',
        '02/05 Redemption Cash-In-Lieu WOLF WOLFSPEED INC 7.81',
        'Total Transactions 7.81'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(0);
      expect(result.optionTransactions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings.some(w => w.includes('No importable transactions found'))).toBe(true);
    });
  });
});
