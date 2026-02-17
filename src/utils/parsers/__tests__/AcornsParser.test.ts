import { describe, it, expect } from 'vitest';
import { AcornsParser } from '../AcornsParser';

describe('AcornsParser', () => {
  const parser = new AcornsParser();

  describe('Basic Parser Properties', () => {
    it('should have correct name and id', () => {
      expect(parser.name).toBe('Acorns');
      expect(parser.id).toBe('acorns');
    });
  });

  describe('Stock Transactions', () => {
    it('should parse a simple stock purchase', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0]).toMatchObject({
        ticker: 'AAPL',
        action: 'buy',
        shares: 10,
        pricePerShare: 150.00
      });
    });

    it('should parse fractional shares', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Tesla Inc. (TSLA)
        0.5
        $200
        .00
        $100
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].shares).toBe(0.5);
    });

    it('should handle fractional prices', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .50
        $1,505
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].pricePerShare).toBe(150.50);
    });

    it('should parse multiple transactions', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        01/20/2026
        01/22/2026
        Bought
        Tesla Inc. (TSLA)
        5
        $200
        .00
        $1,000
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.transactions[1].ticker).toBe('TSLA');
    });
  });

  describe('Date Parsing', () => {
    it('should parse dates in MM/DD/YYYY format', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toBe('2026-01-15');
    });

    it('should handle single-digit months and days', () => {
      const pdfText = `
        Securities Bought
        1/5/2026
        1/7/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].date).toBe('2026-01-05');
    });
  });

  describe('Ticker Extraction', () => {
    it('should extract ticker from description with parentheses', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].ticker).toBe('AAPL');
    });

    it('should warn when ticker cannot be extracted', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. NO TICKER
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Could not extract ticker');
    });
  });

  describe('Error Handling', () => {
    it('should return error when Securities Bought section is missing', () => {
      const pdfText = `
        Some random text without the required section
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Could not find Securities Bought section');
    });

    it('should handle empty PDF text', () => {
      const result = parser.parse('');
      
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should warn about invalid date formats', () => {
      const pdfText = `
        Securities Bought
        INVALID_DATE
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('invalid date');
    });

    it('should handle malformed price data', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        INVALID
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      // Should handle gracefully - either skip or parse with warnings
      expect(result.success).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small fractional shares', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        0.001
        $150
        .00
        $0
        .15
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].shares).toBe(0.001);
    });

    it('should handle large share quantities', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        1000
        $150
        .00
        $150,000
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].shares).toBe(1000);
    });

    it('should handle zero cent prices', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].pricePerShare).toBe(150.00);
    });

    it('should handle 99 cent prices', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .99
        $1,509
        .90
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].pricePerShare).toBe(150.99);
    });
  });

  describe('Transaction Sequence', () => {
    it('should parse transactions in correct order', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        01/20/2026
        01/22/2026
        Bought
        Tesla Inc. (TSLA)
        5
        $200
        .00
        $1,000
        .00
        Base
        01/25/2026
        01/27/2026
        Bought
        Microsoft Corp. (MSFT)
        8
        $300
        .00
        $2,400
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions).toHaveLength(3);
      expect(result.transactions[0].ticker).toBe('AAPL');
      expect(result.transactions[1].ticker).toBe('TSLA');
      expect(result.transactions[2].ticker).toBe('MSFT');
    });
  });

  describe('Fees', () => {
    it('should set fees to 0 (Acorns has no transaction fees)', () => {
      const pdfText = `
        Securities Bought
        01/15/2026
        01/17/2026
        Bought
        Apple Inc. (AAPL)
        10
        $150
        .00
        $1,500
        .00
        Base
        Total Securities Bought
      `;

      const result = parser.parse(pdfText);
      
      expect(result.success).toBe(true);
      expect(result.transactions[0].fees).toBe(0);
    });
  });
});
