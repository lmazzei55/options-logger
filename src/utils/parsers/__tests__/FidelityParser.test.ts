import { describe, it, expect } from 'vitest';
import { FidelityParser } from '../FidelityParser';

describe('FidelityParser', () => {
  const parser = new FidelityParser();

  describe('Basic Parser Properties', () => {
    it('should have correct name and id', () => {
      expect(parser.name).toBe('Fidelity');
      expect(parser.id).toBe('fidelity');
    });
  });

  describe('Stock Transactions', () => {
    it('should parse a simple stock purchase with ticker', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

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

    it('should parse stock sale', () => {
      const pdfText = `
        Transaction Details
        01/20
        Sold
        TSLA
        50
        $200.00
        $10,000.00
        Total Transactions
      `;

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

    it('should parse stock with full date format', () => {
      const pdfText = `
        Transaction Details
        01/15/2026
        Purchase
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toBe('2026-01-15');
    });

    it('should parse stock with fees', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Fees
        $6.95
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].fees).toBe(6.95);
    });

    it('should parse fractional shares', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        0.5
        $150.00
        $75.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].shares).toBe(0.5);
    });

    it('should handle company name with ticker mapping', () => {
      const pdfText = `
        Holdings
        APPLE INC (AAPL)
        Transaction Details
        01/15
        Bought
        APPLE INC
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].ticker).toBe('AAPL');
    });

    it('should parse multiple stock transactions', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        01/20
        Sold
        TSLA
        50
        $200.00
        $10,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.transactions[1].ticker).toBe('TSLA');
    });
  });

  describe('Option Transactions', () => {
    it('should parse call option purchase', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        CALL 150.00 03/20/2026
        10
        $2.50
        $2,500.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'AAPL',
        optionType: 'call',
        action: 'buy-to-open',
        contracts: 10,
        strikePrice: 150.00,
        premiumPerShare: 2.50,
        expirationDate: '2026-03-20'
      });
    });

    it('should parse put option sale', () => {
      const pdfText = `
        Transaction Details
        01/20
        Sold
        TSLA
        PUT 200.00 04/15/2026
        5
        $3.00
        $1,500.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.optionTransactions[0]).toMatchObject({
        ticker: 'TSLA',
        optionType: 'put',
        action: 'sell-to-open',
        contracts: 5,
        strikePrice: 200.00,
        premiumPerShare: 3.00
      });
    });

    it('should parse closing option transaction', () => {
      const pdfText = `
        Transaction Details
        01/25
        Sold
        AAPL
        CALL 150.00 03/20/2026
        10
        $3.00
        $3,000.00
        Realized Gain: $500.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.optionTransactions[0].action).toBe('sell-to-close');
    });

    it('should parse buy-to-close option transaction', () => {
      const pdfText = `
        Transaction Details
        01/25
        Bought
        TSLA
        PUT 200.00 04/15/2026
        5
        $2.00
        $1,000.00
        Closing Transaction
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.optionTransactions[0].action).toBe('buy-to-close');
    });

    it('should parse option with fees', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        CALL 150.00 03/20/2026
        10
        $2.50
        $2,500.00
        Commission
        $6.50
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.optionTransactions[0].fees).toBe(6.50);
    });

    it('should parse option with strike on separate line', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        CALL
        Strike: $150.00
        Expiration: 03/20/2026
        10
        $2.50
        $2,500.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.optionTransactions[0]).toMatchObject({
        strikePrice: 150.00,
        expirationDate: '2026-03-20'
      });
    });
  });

  describe('Date Parsing', () => {
    it('should parse MM/DD format with year from statement', () => {
      const pdfText = `
        January 1-31, 2026
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toBe('2026-01-15');
    });

    it('should parse MM/DD/YYYY format', () => {
      const pdfText = `
        Transaction Details
        01/15/2026
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toBe('2026-01-15');
    });

    it('should handle single-digit months and days', () => {
      const pdfText = `
        Transaction Details
        1/5/2026
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toBe('2026-01-05');
    });

    it('should use current year if no year found', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      // Should have a valid date format
      expect(result.transactions[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Ticker Mapping', () => {
    it('should build ticker map from Holdings section', () => {
      const pdfText = `
        Holdings
        APPLE INC (AAPL)
        TESLA INC (TSLA)
        MICROSOFT CORP (MSFT)
        Transaction Details
        01/15
        Bought
        APPLE INC
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].ticker).toBe('AAPL');
    });

    it('should handle partial company name matches', () => {
      const pdfText = `
        Holdings
        APPLE INC (AAPL)
        Transaction Details
        01/15
        Bought
        APPLE
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].ticker).toBe('AAPL');
    });

    it('should handle case-insensitive company name matching', () => {
      const pdfText = `
        Holdings
        APPLE INC (AAPL)
        Transaction Details
        01/15
        Bought
        apple inc
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].ticker).toBe('AAPL');
    });
  });

  describe('Action Type Detection', () => {
    it('should recognize "Bought" as buy action', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].action).toBe('buy');
    });

    it('should recognize "Purchase" as buy action', () => {
      const pdfText = `
        Transaction Details
        01/15
        Purchase
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].action).toBe('buy');
    });

    it('should recognize "Sold" as sell action', () => {
      const pdfText = `
        Transaction Details
        01/15
        Sold
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].action).toBe('sell');
    });

    it('should recognize "Sale" as sell action', () => {
      const pdfText = `
        Transaction Details
        01/15
        Sale
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].action).toBe('sell');
    });
  });

  describe('Error Handling', () => {
    it('should return error when Transaction Details section is missing', () => {
      const pdfText = `
        Some random text without the required section
      `;

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

    it('should warn when no transactions found', () => {
      const pdfText = `
        Transaction Details
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('No transactions found');
    });

    it('should handle malformed transaction data gracefully', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        INVALID_QUANTITY
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      // Should not crash, should handle gracefully
      expect(result.success).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
    });

    it('should catch and report parsing errors', () => {
      // Test with malformed data that could cause an exception
      const pdfText = `
        Transaction Details
        01/15
        Bought
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      // Should handle gracefully without crashing
      expect(result.success).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('Mixed Transactions', () => {
    it('should parse both stocks and options in same statement', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        01/20
        Bought
        TSLA
        PUT 200.00 04/15/2026
        5
        $3.00
        $1,500.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.optionTransactions).toHaveLength(1);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.optionTransactions[0].ticker).toBe('TSLA');
    });

    it('should handle multiple transactions on same date', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        TSLA
        50
        $200.00
        $10,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small fractional shares', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        0.001
        $150.00
        $0.15
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].shares).toBe(0.001);
    });

    it('should handle large share quantities', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        10000
        $150.00
        $1,500,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].shares).toBe(10000);
    });

    it('should handle prices with commas', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        BRK.A
        1
        $500,000.00
        $500,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].pricePerShare).toBe(500000.00);
    });

    it('should handle zero fees', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].fees).toBe(0);
    });
  });

  describe('Transaction Sequence', () => {
    it('should parse transactions in correct chronological order', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        01/20
        Sold
        TSLA
        50
        $200.00
        $10,000.00
        01/25
        Bought
        MSFT
        75
        $300.00
        $22,500.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.transactions[1].ticker).toBe('TSLA');
      expect(result.transactions[2].ticker).toBe('MSFT');
    });
  });

  describe('Notes Field', () => {
    it('should include import source in notes', () => {
      const pdfText = `
        Transaction Details
        01/15
        Bought
        AAPL
        100
        $150.00
        $15,000.00
        Total Transactions
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].notes).toContain('Fidelity');
    });
  });
});
