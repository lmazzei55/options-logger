# Broker Statement Parser API

This document describes the API for creating broker statement parsers to import transactions into the Options Trading Tracker.

## Overview

The parser system allows automatic extraction of transactions from broker PDF statements. Each broker has its own parser that implements a common interface.

## Parser Interface

All parsers should follow this structure:

```typescript
export class BrokerNameParser {
  name: string;  // Human-readable broker name
  id: string;    // Unique identifier (kebab-case)
  
  parse(pdfText: string): ImportResult;
}
```

## Data Structures

### ImportResult

The `parse()` method returns an `ImportResult` object:

```typescript
interface ImportResult {
  success: boolean;                          // Whether parsing succeeded
  transactions: ParsedTransaction[];         // Stock transactions
  optionTransactions: ParsedOptionTransaction[];  // Options transactions
  errors: string[];                          // Error messages
  warnings: string[];                        // Warning messages
}
```

### ParsedTransaction (Stocks)

For stock transactions:

```typescript
interface ParsedTransaction {
  ticker: string;              // Stock symbol (e.g., "AAPL")
  action: 'buy' | 'sell';      // Transaction type
  quantity: number;            // Number of shares
  price: number;               // Price per share
  fees: number;                // Total fees
  date: string;                // ISO date format (YYYY-MM-DD)
  account?: string;            // Account name (optional)
  notes?: string;              // Additional notes (optional)
}
```

### ParsedOptionTransaction (Options)

For options transactions:

```typescript
interface ParsedOptionTransaction {
  ticker: string;              // Underlying stock symbol
  optionType: 'call' | 'put';  // Option type
  strikePrice: number;         // Strike price
  expirationDate: string;      // ISO date format (YYYY-MM-DD)
  action: OptionAction;        // See below
  quantity: number;            // Number of contracts
  premium: number;             // Price per contract
  fees: number;                // Total fees
  date: string;                // Transaction date (YYYY-MM-DD)
  account?: string;            // Account name (optional)
  notes?: string;              // Additional notes (optional)
}
```

### OptionAction

Valid option action types:

- `'sell-to-open'` - Opening a short position (selling to open)
- `'buy-to-open'` - Opening a long position (buying to open)
- `'sell-to-close'` - Closing a long position (selling to close)
- `'buy-to-close'` - Closing a short position (buying to close)

## Creating a New Parser

### Step 1: Create Parser File

Create a new file in `src/utils/parsers/`:

```typescript
// src/utils/parsers/YourBrokerParser.ts

export class YourBrokerParser {
  name = 'Your Broker Name';
  id = 'your-broker-id';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Your parsing logic here
      
      return {
        success: transactions.length > 0 || optionTransactions.length > 0,
        transactions,
        optionTransactions,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Failed to parse statement: ${error}`);
      return { 
        success: false, 
        transactions: [], 
        optionTransactions: [], 
        errors, 
        warnings 
      };
    }
  }
}
```

### Step 2: Implement Parsing Logic

Key considerations:

1. **PDF Text Format**: The `pdfText` parameter contains raw text extracted from the PDF using pdfjs-dist. The text may have:
   - Inconsistent spacing
   - Page breaks that split data
   - Headers and footers repeated on each page
   - Tables with columns that may not align perfectly

2. **Date Parsing**: Convert dates to ISO format (YYYY-MM-DD):
   ```typescript
   // Example: Convert "01/15/2024" to "2024-01-15"
   const [month, day, year] = dateStr.split('/');
   const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
   ```

3. **Fee Extraction**: Include all fees in the `fees` field:
   - Commission fees
   - Regulatory fees
   - Exchange fees
   - Any other transaction costs

4. **Action Detection**: For options, determine the correct action:
   ```typescript
   // Example logic
   if (category === 'Sale' && action === 'Short Sale') {
     optionAction = 'sell-to-open';
   } else if (category === 'Sale') {
     optionAction = 'sell-to-close';
   } else if (category === 'Purchase' && action === 'Cover Short') {
     optionAction = 'buy-to-close';
   } else {
     optionAction = 'buy-to-open';
   }
   ```

5. **Error Handling**: Use try-catch and provide helpful error messages:
   ```typescript
   try {
     // Parsing logic
   } catch (error) {
     errors.push(`Failed to parse line ${lineNumber}: ${error.message}`);
   }
   ```

6. **Warnings**: Use warnings for non-critical issues:
   ```typescript
   if (transactions.length === 0) {
     warnings.push('No transactions found in statement');
   }
   ```

### Step 3: Integrate with Import Page

Add detection logic in `src/pages/Import.tsx`:

```typescript
import { YourBrokerParser } from '../utils/parsers/YourBrokerParser';

// In the handleFileChange function:
if (text.includes('UNIQUE_BROKER_IDENTIFIER')) {
  const parser = new YourBrokerParser();
  const result = parser.parse(text);
  
  if (result.success) {
    setParsedTransactions(prev => [...prev, ...result.transactions]);
    setParsedOptionTransactions(prev => [...prev, ...result.optionTransactions]);
  }
  
  if (result.errors.length > 0) {
    setErrors(prev => [...prev, ...result.errors]);
  }
  
  if (result.warnings.length > 0) {
    setWarnings(prev => [...prev, ...result.warnings]);
  }
}
```

### Step 4: Test Your Parser

Create test cases:

```typescript
// src/utils/parsers/YourBrokerParser.test.ts
import { describe, it, expect } from 'vitest';
import { YourBrokerParser } from './YourBrokerParser';

describe('YourBrokerParser', () => {
  it('should parse valid statement', () => {
    const parser = new YourBrokerParser();
    const samplePdfText = `
      // Sample statement text
    `;
    
    const result = parser.parse(samplePdfText);
    
    expect(result.success).toBe(true);
    expect(result.transactions.length).toBeGreaterThan(0);
  });

  it('should extract fees correctly', () => {
    const parser = new YourBrokerParser();
    const samplePdfText = `...`;
    
    const result = parser.parse(samplePdfText);
    
    expect(result.transactions[0].fees).toBeGreaterThan(0);
  });

  it('should handle invalid format', () => {
    const parser = new YourBrokerParser();
    const invalidText = 'invalid data';
    
    const result = parser.parse(invalidText);
    
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

## Example: Schwab Monthly Parser

The Schwab monthly parser demonstrates handling of:
- Multiple transactions per date
- Page breaks that split transaction data
- Different transaction formats (SOFI vs AEHR style)
- Fee extraction from multiple fields
- Action detection based on category and action specifiers

See `src/utils/parsers/SchwabMonthlyParser.ts` for implementation details.

## Example: Acorns Parser

The Acorns parser demonstrates:
- Simple stock transaction parsing
- Handling of split price fields
- Basic fee extraction

See `src/utils/parsers/AcornsParser.ts` for implementation details.

## Best Practices

1. **Be Defensive**: Assume the PDF text may be malformed
2. **Validate Data**: Check that extracted values are reasonable
3. **Provide Context**: Include line numbers or snippets in error messages
4. **Handle Edge Cases**: 
   - Empty statements
   - Partial transactions
   - Page breaks mid-transaction
   - Missing or zero fees
5. **Use Regex Carefully**: PDF text spacing can be inconsistent
6. **Test with Real Statements**: Use actual broker PDFs (remove sensitive data)
7. **Document Format**: Add comments explaining the expected statement format

## Debugging Tips

1. **Log the PDF Text**: 
   ```typescript
   console.log('PDF Text:', pdfText);
   ```

2. **Log Line-by-Line**:
   ```typescript
   lines.forEach((line, i) => {
     console.log(`Line ${i}: "${line}"`);
   });
   ```

3. **Test Regex Patterns**: Use regex101.com to test patterns

4. **Check for Hidden Characters**: PDF extraction may include non-visible characters

5. **Verify Date Formats**: Ensure dates are in YYYY-MM-DD format

## Common Pitfalls

1. **Assuming Consistent Spacing**: PDF text extraction doesn't preserve exact spacing
2. **Not Handling Page Breaks**: Transactions may span multiple pages
3. **Forgetting Fees**: Always include fees in calculations
4. **Wrong Action Detection**: Carefully determine if opening or closing a position
5. **Date Format Issues**: Always convert to ISO format (YYYY-MM-DD)
6. **Not Testing Edge Cases**: Test with statements that have unusual formatting

## Getting Help

If you need help creating a parser:

1. Open an issue with the "parser-help" label
2. Include a sample statement (remove sensitive data)
3. Describe the broker and statement type
4. Show what you've tried so far

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on submitting your parser.

---

**Happy parsing!** 🎉
