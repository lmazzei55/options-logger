import { describe, it, expect } from 'vitest';
import { SchwabMonthlyParser } from '../SchwabMonthlyParser';

/**
 * Tests reflect the *real* Schwab PDF format after pdfjs Y-sorted text extraction:
 * all fields on a single visual row are concatenated onto ONE line.
 *
 * Real January 2026 statement example lines:
 *   01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67
 *   26.00 P EXP 01/16/26
 *   Commission $1.30; Industry Fee $0.03
 */
describe('SchwabMonthlyParser', () => {
  const parser = new SchwabMonthlyParser();

  // ---------------------------------------------------------------------------
  // Basic properties
  // ---------------------------------------------------------------------------
  describe('Basic Parser Properties', () => {
    it('should have correct name and id', () => {
      expect(parser.name).toBe('Schwab Monthly Statement');
      expect(parser.id).toBe('schwab-monthly');
    });
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------
  describe('Error Handling', () => {
    it('should return error when Transaction Details section is missing', () => {
      const result = parser.parse('Some random text without the required section');
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Could not find Transaction Details section');
    });

    it('should handle empty PDF text', () => {
      const result = parser.parse('');
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle malformed transaction data gracefully', () => {
      const pdfText = [
        'Transaction Details',
        'INVALID DATA HERE WITH NO STRUCTURE',
        'Total Transactions'
      ].join('\n');
      const result = parser.parse(pdfText);
      expect(result.success).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(Array.isArray(result.optionTransactions)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Real Schwab PDF format — option transactions
  // ---------------------------------------------------------------------------
  describe('Option Transactions (real PDF format)', () => {
    it('should parse a sell-to-open put option (SOFI 26P)', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67',
        '26.00 P EXP 01/16/26',
        'Commission $1.30; Industry Fee $0.03',
        'Total Transactions 62.67'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'SOFI',
        optionType: 'put',
        action: 'sell-to-open',
        contracts: 2,
        strikePrice: 26,
        premiumPerShare: 0.32,
        expirationDate: '2026-01-16',
        fees: 1.33
      });
      expect(result.optionTransactions[0].date).toBe('2026-01-13');
    });

    it('should parse an expired short option as buy-to-close at $0 (NVDA 200C)', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/20 Other Activity Expired Short NVDA 01/16/2026 CALL NVIDIA CORP $200 EXP 01/16/26 (1.0000)',
        '200.00 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
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

    it('should parse an expired long option as sell-to-close at $0 (SOFI 26P)', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/20 Other Activity Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 EXP 01/16/26 2.0000',
        '26.00 P',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
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

    it('should parse a buy-to-open call option (AEHR $35 Jan 2027)', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/22 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $35 EXP 01/15/27 1.0000 8.2500 0.66 (825.66)',
        '35.00 C',
        'Commission $0.65; Industry Fee $0.01',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'AEHR',
        optionType: 'call',
        action: 'buy-to-open',
        contracts: 1,
        strikePrice: 35,
        premiumPerShare: 8.25,
        expirationDate: '2027-01-15',
        fees: 0.66
      });
      expect(result.optionTransactions[0].date).toBe('2026-01-22');
    });

    it('should parse a second buy-to-open call option (AEHR $40 Jan 2027)', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/27 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $40 EXP 01/15/27 1.0000 6.5800 0.66 (658.66)',
        '40.00 C',
        'Commission $0.65; Industry Fee $0.01',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'AEHR',
        optionType: 'call',
        action: 'buy-to-open',
        contracts: 1,
        strikePrice: 40,
        premiumPerShare: 6.58,
        expirationDate: '2027-01-15',
        fees: 0.66
      });
    });

    it('should handle fractional premiums correctly', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67',
        '26.00 P EXP 01/16/26',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.optionTransactions[0].premiumPerShare).toBe(0.32);
    });
  });

  // ---------------------------------------------------------------------------
  // Full statement with all 5 transactions from real January 2026 PDF
  // ---------------------------------------------------------------------------
  describe('Full statement parsing', () => {
    const fullStatement = [
      'January 1-31, 2026',
      'Transaction Details',
      '01/13 Sale SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 (2.0000) 0.3200 1.33 62.67',
      '26.00 P EXP 01/16/26',
      'Commission $1.30; Industry Fee $0.03',
      '01/20 Other Activity Expired Short NVDA 01/16/2026 CALL NVIDIA CORP $200 EXP 01/16/26 (1.0000)',
      '200.00 C',
      'Other Activity Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 EXP 01/16/26 2.0000',
      '26.00 P',
      '01/22 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $35 EXP 01/15/27 1.0000 8.2500 0.66 (825.66)',
      '35.00 C',
      'Commission $0.65; Industry Fee $0.01',
      '01/27 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $40 EXP 01/15/27 1.0000 6.5800 0.66 (658.66)',
      '40.00 C',
      'Commission $0.65; Industry Fee $0.01',
      'Total Transactions (1,421.65)'
    ].join('\n');

    it('should parse all 5 option transactions', () => {
      const result = parser.parse(fullStatement);
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(5);
      expect(result.transactions).toHaveLength(0);
    });

    it('should correctly identify each transaction in order', () => {
      const result = parser.parse(fullStatement);
      const opts = result.optionTransactions;

      expect(opts[0]).toMatchObject({ ticker: 'SOFI', action: 'sell-to-open', contracts: 2, strikePrice: 26 });
      expect(opts[1]).toMatchObject({ ticker: 'NVDA', action: 'buy-to-close', contracts: 1, strikePrice: 200 });
      expect(opts[2]).toMatchObject({ ticker: 'SOFI', action: 'sell-to-close', contracts: 2, strikePrice: 26 });
      expect(opts[3]).toMatchObject({ ticker: 'AEHR', action: 'buy-to-open', contracts: 1, strikePrice: 35 });
      expect(opts[4]).toMatchObject({ ticker: 'AEHR', action: 'buy-to-open', contracts: 1, strikePrice: 40 });
    });

    it('should assign correct dates to all transactions', () => {
      const result = parser.parse(fullStatement);
      const opts = result.optionTransactions;

      expect(opts[0].date).toBe('2026-01-13');
      expect(opts[1].date).toBe('2026-01-20');
      expect(opts[2].date).toBe('2026-01-20'); // inherits date from prior line
      expect(opts[3].date).toBe('2026-01-22');
      expect(opts[4].date).toBe('2026-01-27');
    });

    it('should parse expiration dates in ISO format', () => {
      const result = parser.parse(fullStatement);
      const opts = result.optionTransactions;

      expect(opts[0].expirationDate).toBe('2026-01-16');
      expect(opts[1].expirationDate).toBe('2026-01-16');
      expect(opts[2].expirationDate).toBe('2026-01-16');
      expect(opts[3].expirationDate).toBe('2027-01-15');
      expect(opts[4].expirationDate).toBe('2027-01-15');
    });
  });

  // ---------------------------------------------------------------------------
  // Date inheritance and section detection
  // ---------------------------------------------------------------------------
  describe('Date handling', () => {
    it('should inherit date from previous transaction when no date present', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/20 Other Activity Expired Short NVDA 01/16/2026 CALL NVIDIA CORP $200 EXP 01/16/26 (1.0000)',
        '200.00 C',
        'Other Activity Expired Long SOFI 01/16/2026 PUT SOFI TECHNOLOGIES IN$26 EXP 01/16/26 2.0000',
        '26.00 P',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.optionTransactions).toHaveLength(2);
      expect(result.optionTransactions[0].date).toBe('2026-01-20');
      expect(result.optionTransactions[1].date).toBe('2026-01-20');
    });

    it('should extract year from statement period header', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/22 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $35 EXP 01/15/27 1.0000 8.2500 0.66 (825.66)',
        '35.00 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.optionTransactions[0].date).toContain('2026');
    });

    it('should use current year when statement period not found', () => {
      const pdfText = [
        'Transaction Details',
        '01/22 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $35 EXP 01/15/27 1.0000 8.2500 0.66 (825.66)',
        '35.00 C',
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
        '01/22 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $35 EXP 01/15/27 1.0000 8.2500 0.66 (825.66)',
        '35.00 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
    });

    it('should handle Total Transactions split across lines', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/22 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $35 EXP 01/15/27 1.0000 8.2500 0.66 (825.66)',
        '35.00 C',
        'Total',
        'Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Stock transactions (all-on-one-line format)
  // ---------------------------------------------------------------------------
  describe('Stock Transactions (real PDF format)', () => {
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
        ticker: 'AAPL',
        action: 'buy',
        shares: 100,
        pricePerShare: 150,
        date: '2026-01-15'
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

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        ticker: 'TSLA',
        action: 'sell',
        shares: 50,
        pricePerShare: 200
      });
    });

    it('should parse stock and option transactions together', () => {
      const pdfText = [
        'January 1-31, 2026',
        'Transaction Details',
        '01/15 Purchase AAPL APPLE INC 100 150.00 15000.00',
        '01/22 Purchase AEHR 01/15/2027 CALL AEHR TEST SYS $35 EXP 01/15/27 1.0000 8.2500 0.66 (825.66)',
        '35.00 C',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.optionTransactions[0].ticker).toBe('AEHR');
    });
  });
});
