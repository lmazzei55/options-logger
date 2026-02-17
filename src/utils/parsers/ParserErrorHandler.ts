import type { ImportResult } from './BrokerParser';

/**
 * Parser Error Handler Utility
 * Provides robust error handling and validation for broker statement parsers
 */

export interface ParserContext {
  parserName: string;
  fileName?: string;
  fileSize?: number;
}

export class ParserErrorHandler {
  private context: ParserContext;
  private errors: string[] = [];
  private warnings: string[] = [];

  constructor(context: ParserContext) {
    this.context = context;
  }

  /**
   * Wrap a parser function with comprehensive error handling
   */
  static wrapParser(
    context: ParserContext,
    parserFn: (pdfText: string) => ImportResult
  ): (pdfText: string) => ImportResult {
    return (pdfText: string): ImportResult => {
      const handler = new ParserErrorHandler(context);

      try {
        // Validate input
        if (!pdfText || typeof pdfText !== 'string') {
          handler.addError('Invalid input: PDF text is empty or not a string');
          return handler.createFailureResult();
        }

        if (pdfText.trim().length === 0) {
          handler.addError('PDF text is empty after trimming whitespace');
          return handler.createFailureResult();
        }

        if (pdfText.length > 10_000_000) {
          handler.addWarning('PDF text is very large (>10MB), parsing may be slow');
        }

        // Execute parser
        const result = parserFn(pdfText);

        // Validate result structure
        if (!result || typeof result !== 'object') {
          handler.addError('Parser returned invalid result structure');
          return handler.createFailureResult();
        }

        // Merge any errors/warnings from parser
        if (result.errors) {
          handler.errors.push(...result.errors);
        }
        if (result.warnings) {
          handler.warnings.push(...result.warnings);
        }

        // Add context to result
        return {
          ...result,
          errors: handler.errors,
          warnings: handler.warnings
        };
      } catch (error) {
        // Catch any uncaught exceptions
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stackTrace = error instanceof Error ? error.stack : undefined;

        handler.addError(`Unexpected error during parsing: ${errorMessage}`);
        
        if (stackTrace) {
          console.error(`[${context.parserName}] Stack trace:`, stackTrace);
        }

        return handler.createFailureResult();
      }
    };
  }

  /**
   * Add an error message
   */
  addError(message: string): void {
    this.errors.push(`[${this.context.parserName}] ${message}`);
  }

  /**
   * Add a warning message
   */
  addWarning(message: string): void {
    this.warnings.push(`[${this.context.parserName}] ${message}`);
  }

  /**
   * Create a failure result with accumulated errors
   */
  createFailureResult(): ImportResult {
    return {
      success: false,
      transactions: [],
      optionTransactions: [],
      errors: this.errors,
      warnings: this.warnings
    };
  }

  /**
   * Validate that a required field exists and is not empty
   */
  static validateRequired(value: any, fieldName: string): boolean {
    if (value === undefined || value === null || value === '') {
      return false;
    }
    return true;
  }

  /**
   * Validate that a number is within a reasonable range
   */
  static validateNumber(
    value: number,
    fieldName: string,
    min?: number,
    max?: number
  ): { valid: boolean; error?: string } {
    if (typeof value !== 'number' || isNaN(value) || !isFinite(value)) {
      return { valid: false, error: `${fieldName} must be a valid number` };
    }

    if (min !== undefined && value < min) {
      return { valid: false, error: `${fieldName} must be at least ${min}` };
    }

    if (max !== undefined && value > max) {
      return { valid: false, error: `${fieldName} must be at most ${max}` };
    }

    return { valid: true };
  }

  /**
   * Validate date format (YYYY-MM-DD)
   */
  static validateDate(dateStr: string): { valid: boolean; error?: string } {
    if (!dateStr || typeof dateStr !== 'string') {
      return { valid: false, error: 'Date must be a non-empty string' };
    }

    // Check format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateStr)) {
      return { valid: false, error: 'Date must be in YYYY-MM-DD format' };
    }

    // Check if it's a valid date
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Date is not valid' };
    }

    // Check if date is reasonable (not too far in past or future)
    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      return { valid: false, error: 'Date year must be between 1900 and 2100' };
    }

    return { valid: true };
  }

  /**
   * Safely parse a number from a string, handling common formats
   */
  static parseNumber(value: string | number): number | null {
    if (typeof value === 'number') {
      return isNaN(value) || !isFinite(value) ? null : value;
    }

    if (typeof value !== 'string') {
      return null;
    }

    // Remove common formatting characters
    const cleaned = value.replace(/[$,\s]/g, '').replace(/[()]/g, '-');
    
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? null : parsed;
  }

  /**
   * Safely extract text between two markers
   */
  static extractSection(
    text: string,
    startMarker: string | RegExp,
    endMarker: string | RegExp
  ): string | null {
    try {
      const startRegex = typeof startMarker === 'string' ? new RegExp(startMarker) : startMarker;
      const endRegex = typeof endMarker === 'string' ? new RegExp(endMarker) : endMarker;

      const startMatch = text.match(startRegex);
      if (!startMatch || startMatch.index === undefined) {
        return null;
      }

      const startIndex = startMatch.index + startMatch[0].length;
      const remainingText = text.substring(startIndex);

      const endMatch = remainingText.match(endRegex);
      if (!endMatch || endMatch.index === undefined) {
        return null;
      }

      return remainingText.substring(0, endMatch.index);
    } catch (error) {
      console.error('Error extracting section:', error);
      return null;
    }
  }
}
