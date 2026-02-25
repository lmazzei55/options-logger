import type { BrokerParser, ImportResult, ParsedTransaction, AccountInfo } from './BrokerParser';

export class AcornsParser implements BrokerParser {
  name = 'Acorns';
  id = 'acorns';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Extract account information
    const accountInfo = this.extractAccountInfo(pdfText);

    try {
      // Find the Transactions section
      const lines = pdfText.split('\n').map(l => l.trim());
      
      // Find the start of the Securities Bought section
      let startIndex = -1;
      let endIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i] === 'Securities Bought') {
          startIndex = i + 1;
        }
        if (lines[i] === 'Total Securities Bought') {
          endIndex = i;
          break;
        }
      }
      
      if (startIndex === -1 || endIndex === -1) {
        errors.push('Could not find Securities Bought section in PDF');
        return { success: false, transactions: [], optionTransactions: [], accountInfo, errors, warnings };
      }
      
      // Extract the transaction lines
      const txnLines = lines.slice(startIndex, endIndex).filter(l => l.length > 0);
      
      
      // Parse transactions - each transaction has 10 fields in sequence:
      // 0. Date (MM/DD/YYYY)
      // 1. Settlement Date (MM/DD/YYYY)
      // 2. Activity (Bought/Sold)
      // 3. Description (contains ticker in parentheses)
      // 4. Quantity (number)
      // 5. Price dollars ($XXX)
      // 6. Price cents (.XX)
      // 7. Amount dollars ($XXX)
      // 8. Amount cents (.XX)
      // 9. Portfolio Type (Base/etc)
      
      for (let i = 0; i < txnLines.length; i += 10) {
        if (i + 9 >= txnLines.length) break;
        
        const date = txnLines[i];
        // txnLines[i + 1] is settlement date (not used)
        const activity = txnLines[i + 2];
        const description = txnLines[i + 3];
        const quantity = txnLines[i + 4];
        const priceDollars = txnLines[i + 5];
        const priceCents = txnLines[i + 6];
        // txnLines[i + 7] and [i + 8] are amount (calculated from shares * price)
        // txnLines[i + 9] is portfolio type (not used)
        
        // Combine price dollars and cents
        const price = priceDollars + priceCents; // e.g., "$633" + ".00" = "$633.00"
        
        // Validate date format
        if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(date)) {
          warnings.push(`Skipping invalid date: ${date}`);
          continue;
        }
        
        // Extract ticker from description
        const tickerMatch = description.match(/\(([A-Z]+)\)/);
        if (!tickerMatch) {
          warnings.push(`Could not extract ticker from: ${description}`);
          continue;
        }
        
        const ticker = tickerMatch[1];
        
        // Parse numbers
        const shares = parseFloat(quantity);
        const pricePerShare = parseFloat(price.replace('$', '').replace(',', ''));
        
        if (isNaN(shares) || isNaN(pricePerShare)) {
          warnings.push(`Invalid numbers for ${ticker}: shares=${quantity}, price=${price}`);
          continue;
        }
        
        // Create transaction
        transactions.push({
          date: this.parseDate(date),
          ticker,
          action: activity.toLowerCase() === 'bought' ? 'buy' : 'sell',
          shares,
          pricePerShare,
          fees: 0, // Acorns doesn't show fees separately
          notes: description
        });
      }
      
      return {
        success: transactions.length > 0,
        transactions,
        optionTransactions: [], // Acorns doesn't support options
        accountInfo,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, transactions: [], optionTransactions: [], accountInfo: undefined, errors, warnings };
    }
  }
  
  private parseDate(dateStr: string): string {
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2];
    
    return `${year}-${month}-${day}`;
  }

  private extractAccountInfo(pdfText: string): AccountInfo | undefined {
    // Acorns statements typically show account info at the top
    // Patterns: "Account: 12345678", "Acorns Account"
    const accountNumberMatch = pdfText.match(/Account\s+(?:Number|#)?\s*:?\s*(\d{4,10})/i);
    
    if (!accountNumberMatch) {
      // Acorns may not always show account number, return basic info
      return {
        accountNumber: 'ACORNS',
        broker: 'Acorns',
        accountType: 'brokerage'
      };
    }

    const accountNumber = accountNumberMatch[1];

    return {
      accountNumber,
      broker: 'Acorns',
      accountType: 'brokerage' // Acorns is primarily a brokerage app
    };
  }
}
