import type { BrokerParser, ImportResult, ParsedOptionTransaction, ParsedTransaction } from './BrokerParser';

export class SchwabMonthlyParser implements BrokerParser {
  name = 'Schwab Monthly Statement';
  id = 'schwab-monthly';

  parse(pdfText: string): ImportResult {
    const transactions: ParsedTransaction[] = [];
    const optionTransactions: ParsedOptionTransaction[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Extract year from statement period
      const yearMatch = pdfText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+-\d+,\s+(\d{4})/);
      const year = yearMatch ? yearMatch[1] : new Date().getFullYear().toString();

      // Find Transaction Details section
      const txnSectionMatch = pdfText.match(/Transaction Details[\s\S]*?(?=Endnotes|Terms and Conditions|$)/);
      
      if (!txnSectionMatch) {
        errors.push('Could not find Transaction Details section in PDF');
        return { success: false, transactions: [], optionTransactions: [], errors, warnings };
      }

      const txnSection = txnSectionMatch[0];
      
      // Split into lines
      const lines = txnSection.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      // Parse transactions using a state machine approach
      let i = 0;
      while (i < lines.length) {
        // Look for date pattern (MM/DD)
        const dateMatch = lines[i].match(/^(\d{1,2}\/\d{1,2})\s+(Sale|Purchase)/);
        
        if (dateMatch) {
          const result = this.parseTransactionBlock(lines, i, year);
          if (result) {
            if (result.optionTransaction) {
              optionTransactions.push(result.optionTransaction);
            } else if (result.stockTransaction) {
              transactions.push(result.stockTransaction);
            }
            i = result.nextIndex;
            continue;
          }
        }
        
        i++;
      }

      if (transactions.length === 0 && optionTransactions.length === 0) {
        warnings.push('No transactions found in the statement');
      }

      return {
        success: transactions.length > 0 || optionTransactions.length > 0,
        transactions,
        optionTransactions,
        errors,
        warnings
      };
    } catch (error) {
      errors.push(`Parsing error: ${error instanceof Error ? error.message : String(error)}`);
      return { success: false, transactions: [], optionTransactions: [], errors, warnings };
    }
  }

  private parseTransactionBlock(lines: string[], startIndex: number, year: string): {
    stockTransaction?: ParsedTransaction;
    optionTransaction?: ParsedOptionTransaction;
    nextIndex: number;
  } | null {
    let i = startIndex;
    
    // Parse date and category
    const dateLine = lines[i];
    const dateMatch = dateLine.match(/^(\d{1,2}\/\d{1,2})\s+(Sale|Purchase)/);
    if (!dateMatch) return null;
    
    const dateStr = dateMatch[1];
    const category = dateMatch[2];
    i++;
    
    // Check for action (Short Sale, Cover Short)
    let action = '';
    if (i < lines.length && (lines[i] === 'Short Sale' || lines[i] === 'Cover Short')) {
      action = lines[i];
      i++;
    }
    
    // Collect next 20 lines for analysis
    const blockLines = lines.slice(i, Math.min(i + 20, lines.length));
    const blockText = blockLines.join(' ');
    
    // Check if this is an options transaction
    // Look for option indicators: "CALL" or "PUT" and expiration date pattern
    const isOption = /\b(CALL|PUT)\b/.test(blockText) && /EXP\s+\d{2}\/\d{2}\/\d{2}/.test(blockText);
    
    if (isOption) {
      return this.parseOptionTransaction(blockLines, dateStr, category, action, year, i);
    } else {
      // Stock transaction (not implemented yet)
      return { nextIndex: i + 1 };
    }
  }

  private parseOptionTransaction(
    blockLines: string[],
    dateStr: string,
    category: string,
    action: string,
    year: string,
    baseIndex: number
  ): {
    optionTransaction?: ParsedOptionTransaction;
    nextIndex: number;
  } | null {
    const blockText = blockLines.join(' ');
    
    // Find where this transaction ends (look for next date or end marker)
    let transactionEndIndex = 0;
    for (let i = 1; i < blockLines.length; i++) {
      // Check if this line starts a new transaction
      if (/^\d{1,2}\/\d{1,2}\s+(Sale|Purchase)/.test(blockLines[i])) {
        transactionEndIndex = i;
        break;
      }
    }
    if (transactionEndIndex === 0) {
      transactionEndIndex = Math.min(15, blockLines.length);
    }
    
    // Extract ticker - look for pattern "CALL/PUT TICKER" or standalone ticker near CALL/PUT
    let ticker = '';
    
    // First try: look for "CALL TICKER" or "PUT TICKER" pattern
    const callPutTickerMatch = blockText.match(/\b(CALL|PUT)\s+([A-Z]{2,5})\b/);
    if (callPutTickerMatch) {
      ticker = callPutTickerMatch[2];
    } else {
      // Second try: find ticker in individual lines near CALL/PUT
      for (let i = 0; i < blockLines.length && i < 10; i++) {
        const line = blockLines[i];
        // Look for standalone ticker (2-5 caps letters, not CUSIP/Symbol/etc)
        if (/^[A-Z]{2,5}$/.test(line) && line !== 'CUSIP' && line !== 'Symbol') {
          // Check if CALL or PUT appears in next few lines
          const nextLines = blockLines.slice(i, i + 5).join(' ');
          if (/\b(CALL|PUT)\b/.test(nextLines)) {
            ticker = line;
            break;
          }
        }
      }
    }
    
    if (!ticker) return { nextIndex: baseIndex + transactionEndIndex };
    
    // Extract option type (CALL or PUT)
    const typeMatch = blockText.match(/\b(CALL|PUT)\b/);
    if (!typeMatch) return { nextIndex: baseIndex + transactionEndIndex };
    const optionType = typeMatch[1].toLowerCase() as 'call' | 'put';
    
    // Extract strike price (look for $XX or $XX.XX pattern)
    const strikeMatch = blockText.match(/\$(\d+(?:\.\d+)?)/);
    if (!strikeMatch) return { nextIndex: baseIndex + transactionEndIndex };
    const strikePrice = parseFloat(strikeMatch[1]);
    
    // Extract expiration date (EXP MM/DD/YY)
    const expMatch = blockText.match(/EXP\s+(\d{2})\/(\d{2})\/(\d{2})/);
    if (!expMatch) return { nextIndex: baseIndex + transactionEndIndex };
    const expirationDate = `20${expMatch[3]}-${expMatch[1]}-${expMatch[2]}`;
    
    // Extract quantity (look for number in parentheses or standalone)
    // Quantity appears as (10.0000) or 14.0000
    const quantities = blockLines.filter(l => /^\(?\d+\.\d+\)?$/.test(l));
    if (quantities.length === 0) return { nextIndex: baseIndex + transactionEndIndex };
    
    const quantityStr = quantities[0];
    const quantity = parseFloat(quantityStr.replace(/[()]/g, ''));
    
    // Extract price per share (small decimal, typically < 10)
    const prices = blockLines
      .filter(l => /^\d+\.\d+$/.test(l))
      .map(l => parseFloat(l))
      .filter(p => p > 0 && p < 100);
    
    if (prices.length < 2) return { nextIndex: baseIndex + transactionEndIndex };
    const premiumPerShare = prices[0]; // First price is usually the premium
    
    // Extract fees (charges/interest)
    const fees = prices.length >= 2 ? prices[1] : 0;
    
    // Determine option action based on category and action
    let optionAction: 'sell-to-open' | 'buy-to-open' | 'buy-to-close' | 'sell-to-close';
    
    // Check if there's a realized gain/loss indicator (means closing a position)
    const hasRealizedGL = blockText.includes('(ST)') || blockText.includes('(LT)');
    
    if (category === 'Sale' && action === 'Short Sale') {
      optionAction = 'sell-to-open';
    } else if (category === 'Purchase' && action === 'Cover Short') {
      optionAction = 'buy-to-close';
    } else if (category === 'Sale' && hasRealizedGL) {
      optionAction = 'sell-to-close';
    } else if (category === 'Sale') {
      optionAction = 'sell-to-open'; // Sale without action or realized G/L is likely sell-to-open
    } else if (category === 'Purchase' && hasRealizedGL) {
      optionAction = 'buy-to-close';
    } else {
      optionAction = 'buy-to-open';
    }
    
    // Parse date
    const fullDate = this.parseDate(`${dateStr}/${year}`);
    
    return {
      optionTransaction: {
        date: fullDate,
        ticker,
        optionType,
        action: optionAction,
        contracts: Math.abs(quantity),
        strikePrice,
        premiumPerShare,
        expirationDate,
        fees,
        notes: `Imported from Schwab monthly statement`
      },
      nextIndex: baseIndex + transactionEndIndex
    };
  }

  private parseDate(dateStr: string): string {
    // Convert MM/DD/YYYY to YYYY-MM-DD
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    
    const month = parts[0].padStart(2, '0');
    const day = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
    
    return `${year}-${month}-${day}`;
  }
}
