import { describe, it, expect } from 'vitest';
import {
  sanitizeString,
  sanitizeTicker,
  sanitizeNumber,
  sanitizeDate,
  sanitizeOptionAction,
  sanitizeOptionType,
  sanitizeAccountName,
  sanitizeNotes,
} from './sanitization';

describe('Sanitization Utilities', () => {
  describe('sanitizeString', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeString('<script>alert("xss")</script>')).toBe('scriptalert("xss")/script');
      expect(sanitizeString('Hello <b>World</b>')).toBe('Hello bWorld/b');
    });
    
    it('should remove javascript: protocol', () => {
      expect(sanitizeString('javascript:alert("xss")')).toBe('alert("xss")');
    });
    
    it('should remove event handlers', () => {
      expect(sanitizeString('onclick=alert("xss")')).toBe('alert("xss")');
    });
    
    it('should trim whitespace', () => {
      expect(sanitizeString('  hello  ')).toBe('hello');
    });
    
    it('should limit length', () => {
      const longString = 'a'.repeat(2000);
      expect(sanitizeString(longString).length).toBe(1000);
    });
  });
  
  describe('sanitizeTicker', () => {
    it('should convert to uppercase', () => {
      expect(sanitizeTicker('aapl')).toBe('AAPL');
      expect(sanitizeTicker('msft')).toBe('MSFT');
    });
    
    it('should remove non-letter characters', () => {
      expect(sanitizeTicker('A@APL123')).toBe('AAPL');
      expect(sanitizeTicker('MS-FT')).toBe('MSFT');
    });
    
    it('should limit to 5 characters', () => {
      expect(sanitizeTicker('ABCDEFGH')).toBe('ABCDE');
    });
    
    it('should trim whitespace', () => {
      expect(sanitizeTicker('  AAPL  ')).toBe('AAPL');
    });
  });
  
  describe('sanitizeNumber', () => {
    it('should parse string numbers', () => {
      expect(sanitizeNumber('123.45')).toBe(123.45);
      expect(sanitizeNumber('100')).toBe(100);
    });
    
    it('should handle negative numbers', () => {
      expect(sanitizeNumber('-50.25')).toBe(-50.25);
    });
    
    it('should return 0 for invalid numbers', () => {
      expect(sanitizeNumber('abc')).toBe(0);
      expect(sanitizeNumber('NaN')).toBe(0);
    });
    
    it('should handle number input', () => {
      expect(sanitizeNumber(123.45)).toBe(123.45);
      expect(sanitizeNumber(Infinity)).toBe(0);
    });
  });
  
  describe('sanitizeDate', () => {
    it('should accept valid ISO dates', () => {
      expect(sanitizeDate('2026-01-15')).toBe('2026-01-15');
      expect(sanitizeDate('2025-12-31')).toBe('2025-12-31');
    });
    
    it('should reject invalid formats', () => {
      expect(sanitizeDate('01/15/2026')).toBe('');
      expect(sanitizeDate('2026-1-15')).toBe('');
    });
    
    it('should reject invalid dates', () => {
      expect(sanitizeDate('2026-13-01')).toBe('');
      expect(sanitizeDate('2026-02-30')).toBe('');
    });
  });
  
  describe('sanitizeOptionAction', () => {
    it('should accept valid actions', () => {
      expect(sanitizeOptionAction('buy-to-open')).toBe('buy-to-open');
      expect(sanitizeOptionAction('sell-to-close')).toBe('sell-to-close');
    });
    
    it('should normalize case', () => {
      expect(sanitizeOptionAction('BUY-TO-OPEN')).toBe('buy-to-open');
      expect(sanitizeOptionAction('Sell-To-Close')).toBe('sell-to-close');
    });
    
    it('should reject invalid actions', () => {
      expect(sanitizeOptionAction('invalid')).toBe('');
      expect(sanitizeOptionAction('buy')).toBe('');
    });
  });
  
  describe('sanitizeOptionType', () => {
    it('should accept call and put', () => {
      expect(sanitizeOptionType('call')).toBe('call');
      expect(sanitizeOptionType('put')).toBe('put');
    });
    
    it('should normalize case', () => {
      expect(sanitizeOptionType('CALL')).toBe('call');
      expect(sanitizeOptionType('Put')).toBe('put');
    });
    
    it('should accept single letter', () => {
      expect(sanitizeOptionType('c')).toBe('call');
      expect(sanitizeOptionType('p')).toBe('put');
    });
    
    it('should reject invalid types', () => {
      expect(sanitizeOptionType('invalid')).toBe('');
      expect(sanitizeOptionType('option')).toBe('');
    });
  });
  
  describe('sanitizeAccountName', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeAccountName('My <b>Account</b>')).toBe('My bAccount/b');
    });
    
    it('should trim whitespace', () => {
      expect(sanitizeAccountName('  My Account  ')).toBe('My Account');
    });
    
    it('should limit length', () => {
      const longName = 'a'.repeat(200);
      expect(sanitizeAccountName(longName).length).toBe(100);
    });
  });
  
  describe('sanitizeNotes', () => {
    it('should remove HTML tags', () => {
      expect(sanitizeNotes('Test <script>alert()</script>')).toBe('Test scriptalert()/script');
    });
    
    it('should limit length', () => {
      const longNotes = 'a'.repeat(1000);
      expect(sanitizeNotes(longNotes).length).toBe(500);
    });
  });
});
