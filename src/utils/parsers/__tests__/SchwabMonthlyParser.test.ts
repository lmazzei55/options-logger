import { describe, it, expect } from 'vitest';
import { SchwabMonthlyParser } from '../SchwabMonthlyParser';

describe('SchwabMonthlyParser', () => {
  const parser = new SchwabMonthlyParser();

  describe('Basic Parser Properties', () => {
    it('should have correct name and id', () => {
      expect(parser.name).toBe('Schwab Monthly Statement');
      expect(parser.id).toBe('schwab-monthly');
    });
  });

  describe('Stock Transactions', () => {
    it('should parse a simple stock purchase', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        ticker: 'AAPL',
        action: 'buy',
        shares: 100,
        pricePerShare: 150.00
      });
    });

    it('should parse a stock sale', () => {
      const pdfText = [
        'Transaction Details',
        '01/20 Sale',
        'TSLA',
        'Tesla Inc.',
        '50',
        '200.00',
        '10000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        ticker: 'TSLA',
        action: 'sell',
        shares: 50,
        pricePerShare: 200.00
      });
    });

    it('should parse multiple stock transactions', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        '01/20 Sale',
        'TSLA',
        'Tesla Inc.',
        '50',
        '200.00',
        '10000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.transactions[1].ticker).toBe('TSLA');
    });

    it('should handle fees correctly', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        'Fees & Commissions',
        '$6.95',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].fees).toBe(6.95);
    });
  });

  describe('Option Transactions', () => {
    it('should parse a sell-to-open put option (AEHR format)', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Sale',
        'Short Sale',
        'AAPL',
        '02/21/2026 150.00',
        'P',
        'PUT APPLE INC',
        '$150',
        'EXP 02/21/26',
        '(1.0000)',
        '5.00',
        '6.64',
        '493.36',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'AAPL',
        optionType: 'put',
        action: 'sell-to-open',
        contracts: 1,
        strikePrice: 150,
        premiumPerShare: 5.00
      });
    });

    it('should parse a buy-to-open call option (AEHR format)', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'TSLA',
        '03/21/2026 200.00',
        'C',
        'CALL TESLA INC',
        '$200',
        'EXP 03/21/26',
        '2.0000',
        '10.00',
        '6.64',
        '2006.64',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'TSLA',
        optionType: 'call',
        action: 'buy-to-open',
        contracts: 2,
        strikePrice: 200,
        premiumPerShare: 10.00
      });
    });

    it('should parse option expiration dates correctly', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Sale',
        'Short Sale',
        'AAPL',
        '02/21/2026 150.00',
        'P',
        'PUT APPLE INC',
        '$150',
        'EXP 02/21/26',
        '(1.0000)',
        '5.00',
        '6.64',
        '493.36',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0].expirationDate).toBe('2026-02-21');
    });

    it('should handle fractional premiums', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Sale',
        'Short Sale',
        'AAPL',
        '02/21/2026 150.00',
        'P',
        'PUT APPLE INC',
        '$150',
        'EXP 02/21/26',
        '(1.0000)',
        '5.50',
        '6.64',
        '543.36',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions[0].premiumPerShare).toBe(5.50);
    });

    it('should parse SOFI format options (expiration in ticker line, strike+type combined)', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Sale',
        'Short Sale',
        'SOFI 01/30/2026',
        '26.00 P',
        'PUT SOFI TECHNOLOGIES IN$26',
        'EXP 01/30/26',
        '(10.0000)',
        '0.88',
        '6.64',
        '873.36',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'SOFI',
        optionType: 'put',
        action: 'sell-to-open',
        contracts: 10,
        strikePrice: 26,
        premiumPerShare: 0.88,
        expirationDate: '2026-01-30'
      });
    });
  });

  describe('Error Handling', () => {
    it('should return error when Transaction Details section is missing', () => {
      const pdfText = 'Some random text without the required section';

      const result = parser.parse(pdfText);

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
        '01/15 Purchase',
        'INVALID DATA HERE',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      // Should not throw error, but may have warnings or return empty transactions
      expect(result.success).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
      expect(Array.isArray(result.optionTransactions)).toBe(true);
    });
  });

  describe('Date Parsing', () => {
    it('should extract year from statement period', () => {
      const pdfText = [
        'Statement Period: January 1-31, 2026',
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toContain('2026');
    });

    it('should use current year if statement period not found', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);
      const currentYear = new Date().getFullYear().toString();

      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toContain(currentYear);
    });
  });

  describe('Edge Cases', () => {
    it('should handle transactions with no fees', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions[0].fees).toBe(0);
    });

    it('should handle very small share quantities', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '1',
        '150.00',
        '150.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions[0].shares).toBe(1);
    });

    it('should handle large share quantities', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '10000',
        '150.00',
        '1500000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions[0].shares).toBe(10000);
    });

    it('should handle multiple transactions on the same date', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        'TSLA',
        'Tesla Inc.',
        '50',
        '200.00',
        '10000.00',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].date).toBe(result.transactions[1].date);
    });
  });

  describe('Mixed Transactions', () => {
    it('should parse both stock and option transactions in the same statement', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'AAPL',
        'Apple Inc.',
        '100',
        '150.00',
        '15000.00',
        '01/16 Sale',
        'Short Sale',
        'TSLA',
        '02/21/2026 200.00',
        'P',
        'PUT TESLA INC',
        '$200',
        'EXP 02/21/26',
        '(1.0000)',
        '5.00',
        '6.64',
        '493.36',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.optionTransactions[0].ticker).toBe('TSLA');
    });
  });

  describe('Action Detection', () => {
    it('should detect sell-to-open with Short Sale action', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Sale',
        'Short Sale',
        'AAPL',
        '02/21/2026 150.00',
        'C',
        'CALL APPLE INC',
        '$150',
        'EXP 02/21/26',
        '(1.0000)',
        '3.00',
        '6.64',
        '293.36',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions[0].action).toBe('sell-to-open');
    });

    it('should detect buy-to-close with Cover Short action', () => {
      const pdfText = [
        'Transaction Details',
        '01/15 Purchase',
        'Cover Short',
        'AAPL',
        '02/21/2026 150.00',
        'C',
        'CALL APPLE INC',
        '$150',
        'EXP 02/21/26',
        '1.0000',
        '1.50',
        '6.64',
        '156.64',
        'Total Transactions'
      ].join('\n');

      const result = parser.parse(pdfText);

      expect(result.success).toBe(true);
      expect(result.optionTransactions[0].action).toBe('buy-to-close');
    });
  });
});
