import type { BrokerParser, ImportResult, ParsedTransaction } from './BrokerParser';

export class AcornsParser implements BrokerParser {
  name = 'Acorns';
  id = 'acorns';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Debug: log the PDF text to console
    console.log('=== PDF Text Extraction ===');
    console.log('First 2000 chars:', pdfText.substring(0, 2000));
    console.log('========================');

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
        return { success: false, transactions: [], errors, warnings };
      }
      
      // Extract the transaction lines
      const txnLines = lines.slice(startIndex, endIndex).filter(l => l.length > 0);
      
      // Debug: log transaction lines
      console.log('Transaction lines:', txnLines.slice(0, 40));
      
      // Parse transactions - each transaction has 8 fields in sequence:
      // 1. Date (MM/DD/YYYY)
      // 2. Settlement Date (MM/DD/YYYY)
      // 3. Activity (Bought/Sold)
      // 4. Description (contains ticker in parentheses)
      // 5. Quantity (number)
      // 6. Price ($XXX.XX)
      // 7. Amount ($XXX.XX)
      // 8. Portfolio Type (Base/etc)
      
      for (let i = 0; i < txnLines.length; i += 8) {
        if (i + 7 >= txnLines.length) break;
        
        const date = txnLines[i];
        // txnLines[i + 1] is settlement date (not used)
        const activity = txnLines[i + 2];
        const description = txnLines[i + 3];
        const quantity = txnLines[i + 4];
        const price = txnLines[i + 5];
        // txnLines[i + 6] is amount (calculated from shares * price)
        // txnLines[i + 7] is portfolio type (not used)
        
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
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, transactions: [], errors, warnings };
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
}
